// Supabase Edge Function: book-lookup
// Server-side metadata aggregation across Google Books, Open Library, and openBD.
// Keeps optional API keys (GOOGLE_BOOKS_API_KEY) off the frontend and normalizes results.

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
    const { isbn, query } = (await req.json()) as { isbn?: string; query?: string };
    const cleanIsbn = (isbn ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
    const q = (query ?? '').trim();

    if (!cleanIsbn && !q) {
      return new Response(JSON.stringify({ candidates: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidates: Record<string, unknown>[] = [];
    const googleKey = Deno.env.get('GOOGLE_BOOKS_API_KEY');

    // 1. Google Books
    try {
      const gbQuery = cleanIsbn ? `isbn:${cleanIsbn}` : q;
      const gbUrl = new URL('https://www.googleapis.com/books/v1/volumes');
      gbUrl.searchParams.set('q', gbQuery);
      gbUrl.searchParams.set('maxResults', '8');
      if (googleKey) gbUrl.searchParams.set('key', googleKey);
      const res = await fetch(gbUrl.toString());
      if (res.ok) {
        const data = await res.json();
        for (const item of data.items ?? []) {
          const info = item.volumeInfo ?? {};
          const ids = info.industryIdentifiers ?? [];
          const isbn13 = ids.find((x: { type: string }) => x.type === 'ISBN_13')?.identifier ?? null;
          const isbn10 = ids.find((x: { type: string }) => x.type === 'ISBN_10')?.identifier ?? null;
          candidates.push({
            externalId: item.id,
            provider: 'google_books',
            verified: false,
            title: info.title ?? 'Untitled',
            subtitle: info.subtitle,
            authors: info.authors ?? [],
            translators: [],
            publishers: info.publisher ? [info.publisher] : [],
            publishedDate: info.publishedDate,
            publishedYear: info.publishedDate ? Number(String(info.publishedDate).slice(0, 4)) || null : null,
            language: info.language ?? 'en',
            pageCount: info.pageCount ?? null,
            genres: info.categories ?? [],
            description: info.description,
            isbn13,
            isbn10,
            coverUrl: info.imageLinks?.thumbnail?.replace('http://', 'https://'),
            rawPayload: item,
          });
        }
      }
    } catch {
      // Provider failure is non-fatal
    }

    // 2. Open Library
    try {
      if (cleanIsbn) {
        const res = await fetch(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
        );
        if (res.ok) {
          const data = await res.json();
          const entry = data[`ISBN:${cleanIsbn}`];
          if (entry) {
            candidates.push({
              externalId: entry.key ?? `ol-${cleanIsbn}`,
              provider: 'open_library',
              verified: false,
              title: entry.title ?? 'Untitled',
              subtitle: entry.subtitle,
              authors: (entry.authors ?? []).map((a: { name: string }) => a.name),
              translators: [],
              publishers: (entry.publishers ?? []).map((p: { name: string }) => p.name),
              publishedDate: entry.publish_date,
              publishedYear: entry.publish_date
                ? Number(String(entry.publish_date).match(/\d{4}/)?.[0]) || null
                : null,
              language: 'en',
              pageCount: entry.number_of_pages ?? null,
              genres: (entry.subjects ?? []).slice(0, 6).map((s: { name: string }) => s.name),
              isbn13: cleanIsbn.length === 13 ? cleanIsbn : null,
              isbn10: cleanIsbn.length === 10 ? cleanIsbn : null,
              coverUrl: entry.cover?.large ?? entry.cover?.medium,
              rawPayload: entry,
            });
          }
        }
      } else {
        const res = await fetch(
          `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`
        );
        if (res.ok) {
          const data = await res.json();
          for (const doc of data.docs ?? []) {
            const firstIsbn = (doc.isbn ?? []).find((x: string) => x.length === 13) ?? doc.isbn?.[0];
            candidates.push({
              externalId: doc.key,
              provider: 'open_library',
              verified: false,
              title: doc.title ?? 'Untitled',
              authors: doc.author_name ?? [],
              translators: [],
              publishers: (doc.publisher ?? []).slice(0, 2),
              publishedYear: doc.first_publish_year ?? null,
              language: doc.language?.[0] ?? 'en',
              pageCount: doc.number_of_pages_median ?? null,
              genres: (doc.subject ?? []).slice(0, 5),
              isbn13: firstIsbn?.length === 13 ? firstIsbn : null,
              isbn10: firstIsbn?.length === 10 ? firstIsbn : null,
              coverUrl: doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
                : undefined,
              rawPayload: doc,
            });
          }
        }
      }
    } catch {
      // Non-fatal
    }

    // 3. openBD (Japanese ISBNs 978-4-*)
    if (cleanIsbn && cleanIsbn.startsWith('9784')) {
      try {
        const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${cleanIsbn}`);
        if (res.ok) {
          const arr = await res.json();
          const item = arr?.[0];
          if (item?.summary) {
            candidates.push({
              externalId: `openbd-${cleanIsbn}`,
              provider: 'openbd',
              verified: false,
              title: item.summary.title ?? 'Untitled',
              authors: item.summary.author ? [item.summary.author] : [],
              translators: [],
              publishers: item.summary.publisher ? [item.summary.publisher] : [],
              publishedDate: item.summary.pubdate,
              publishedYear: item.summary.pubdate
                ? Number(String(item.summary.pubdate).slice(0, 4)) || null
                : null,
              language: 'ja',
              genres: [],
              isbn13: cleanIsbn,
              isbn10: null,
              coverUrl: item.summary.cover || undefined,
              seriesName: item.summary.series || undefined,
              volumeNumber: item.summary.volume || undefined,
              rawPayload: item,
            });
          }
        }
      } catch {
        // Non-fatal
      }
    }

    return new Response(JSON.stringify({ candidates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err), candidates: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
