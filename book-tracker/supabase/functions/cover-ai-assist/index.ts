// Supabase Edge Function: cover-ai-assist
// Strictly OPT-IN, manual-trigger-only helper for extracting candidate bibliographic
// details from a book front-cover photo when standard barcode/ISBN is unavailable.
// Never auto-runs and always returns verified=false candidate data for user review.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType, explicitUserTrigger } = (await req.json()) as {
      imageBase64?: string;
      mimeType?: string;
      explicitUserTrigger?: boolean;
    };

    if (!explicitUserTrigger) {
      return new Response(
        JSON.stringify({ error: 'Cover AI recognition must be explicitly triggered by user.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(
        JSON.stringify({
          error: 'Server GEMINI_API_KEY is not configured; please use local OCR or manual entry.',
        }),
        { status: 501, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  'Extract bibliographic fields visible on this book cover as JSON with keys: ' +
                  'title, subtitle, authors (string[]), translators (string[]), publishers (string[]), ' +
                  'language (ISO 639-1), editionName, isbn13 (if visible). Return ONLY valid JSON.',
              },
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const msg = await response.text();
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(rawText);

    return new Response(
      JSON.stringify({
        candidate: {
          externalId: `ai-${crypto.randomUUID()}`,
          provider: 'ai_assist',
          verified: false,
          title: parsed.title || '',
          subtitle: parsed.subtitle || undefined,
          authors: Array.isArray(parsed.authors) ? parsed.authors : [],
          translators: Array.isArray(parsed.translators) ? parsed.translators : [],
          publishers: Array.isArray(parsed.publishers) ? parsed.publishers : [],
          language: parsed.language || 'vi',
          genres: [],
          isbn13: parsed.isbn13 || null,
          rawPayload: parsed,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
