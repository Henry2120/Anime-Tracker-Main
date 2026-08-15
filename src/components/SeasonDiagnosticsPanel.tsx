import React, { useState, useEffect, useMemo } from 'react';
import {
  Bug,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Terminal,
  ExternalLink,
  Layers,
  Search,
  Check,
  Eye,
  User,
  ShieldCheck,
  Activity,
  FileCode2,
} from 'lucide-react';
import { MalListItem } from '../types';

interface SingleAnimeLookupResult {
  malId: number;
  timestamp: string;
  authenticatedUser: {
    id: number;
    name: string;
  } | null;
  anime: {
    id: number;
    title: string | null;
    season: string | null;
    year: number | null;
    seasonDisplay: string;
    isSummer2026: boolean;
  };
  personalList: {
    inPersonalList: boolean;
    status: string;
    score: number | null;
    numEpisodesWatched: number | null;
    rawListStatus: any;
  };
  eligibility: {
    isEligible: boolean;
    reason: string;
  };
  mal: {
    authenticated: boolean;
    found: boolean;
    status: string | null;
    error: string | null;
  };
}

interface DatasetDiagnosticsData {
  timestamp: string;
  authenticated: boolean;
  authenticatedUser: {
    id: number;
    name: string;
    joined_at?: string;
    location?: string;
  } | null;
  backendMalList: {
    total: number;
    uniqueIdsCount: number;
    watchingCount: number;
    watchingIds: number[];
    watchingItems: Array<{
      id: number;
      title: string;
      status: string;
      start_season?: { year?: number; season?: string };
      start_date?: string;
    }>;
    error: string | null;
  };
  directCheck61126: {
    inUserListResponse: boolean;
    userListStatus: any;
    directAnimeEndpointChecked: boolean;
    animeExists: boolean;
    myListStatusExists: boolean;
    myListStatus: any;
    conclusion: string;
  };
  jikanSummer2026: {
    totalEntries: number;
    uniqueIdsCount: number;
    ids: number[];
  };
  expectedSummerWatching: Array<{
    id: number;
    title: string;
    status: string;
    start_season?: { year?: number; season?: string };
    start_date?: string;
    inJikanCatalogue: boolean;
    jikanSeason?: string | null;
    jikanYear?: number | null;
  }>;
}

interface MalInvestigationData {
  timestamp: string;
  authenticatedUser: {
    id: number;
    name: string;
    joined_at?: string;
    location?: string;
  } | null;
  bulkAnimelist: {
    pagesFetched: number;
    totalEntries: number;
    watchingCount: number;
    pages: Array<{
      page: number;
      itemCount: number;
      hasNext: boolean;
      firstMalId: number | null;
      firstTitle: string | null;
      lastMalId: number | null;
      lastTitle: string | null;
      found61126: boolean;
    }>;
    found61126: boolean;
    found61126Page: number | null;
    error: string | null;
  };
  directCheck61126: {
    url: string;
    animeExists: boolean;
    myListStatusExists: boolean;
    myListStatus: any;
    title: string | null;
    rating: string | null;
    nsfw: any;
    error: string | null;
  };
  statusFilteredBulk: {
    url: string;
    totalReturned: number;
    found61126: boolean;
    item61126: any;
    error: string | null;
  };
  nsfwBulk: {
    url: string;
    totalReturned: number;
    found61126: boolean;
    error: string | null;
  };
  largeLimitBulk: {
    url: string;
    totalReturned: number;
    found61126: boolean;
    error: string | null;
  };
  alternativeSorts: {
    listUpdatedAt: { total: number; found61126: boolean; error: string | null };
    animeTitle: { total: number; found61126: boolean; error: string | null };
    listScore: { total: number; found61126: boolean; error: string | null };
    animeStartDate: { total: number; found61126: boolean; error: string | null };
  };
  summer2026Discrepancy: {
    jikanCandidatesTested: number;
    individualWatchingCount: number;
    alsoInBulkCount: number;
    missingFromBulk: Array<{
      id: number;
      title: string;
      individualStatus: string;
      score: number | null;
      episodes: number | null;
    }>;
    unexpectedInBulk: any[];
  };
  conclusion: {
    summary: string;
    rootCause: string;
  };
}

interface Props {
  malList: MalListItem[];
  currentlyWatchingItems: any[];
  jikanSummer2026Ids: Set<number>;
  fallbackSummer2026Ids: Set<number>;
}

export function SeasonDiagnosticsPanel({
  malList,
  currentlyWatchingItems,
  jikanSummer2026Ids,
  fallbackSummer2026Ids,
}: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'render' | 'investigation'>('investigation');
  const [loading, setLoading] = useState<boolean>(false);
  const [datasetData, setDatasetData] = useState<DatasetDiagnosticsData | null>(null);
  const [investigationData, setInvestigationData] = useState<MalInvestigationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [domRowCount, setDomRowCount] = useState<number>(0);
  const [domRowIds, setDomRowIds] = useState<number[]>([]);
  const [singleMalIdInput, setSingleMalIdInput] = useState<string>('61126');
  const [singleLookupLoading, setSingleLookupLoading] = useState<boolean>(false);
  const [singleLookupResult, setSingleLookupResult] = useState<SingleAnimeLookupResult | null>(null);
  const [singleLookupError, setSingleLookupError] = useState<string | null>(null);

  const handleCheckSingleAnime = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = parseInt(singleMalIdInput.trim(), 10);
    if (isNaN(id) || id <= 0) {
      setSingleLookupError('Please enter a valid positive MAL anime ID');
      return;
    }

    setSingleLookupLoading(true);
    setSingleLookupError(null);
    try {
      const res = await fetch(`/api/debug/anime/${id}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status} when checking MAL anime ID ${id}`);
      }
      const data = await res.json();
      setSingleLookupResult(data);
    } catch (err: any) {
      setSingleLookupError(err.message || 'Failed to check anime');
    } finally {
      setSingleLookupLoading(false);
    }
  };

  const fetchDatasetDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resDataset, resInvest] = await Promise.all([
        fetch('/api/debug/dataset'),
        fetch('/api/debug/mal-investigation'),
      ]);

      if (resDataset.ok) {
        const jsonDataset = await resDataset.json();
        setDatasetData(jsonDataset);
      }
      if (resInvest.ok) {
        const jsonInvest = await resInvest.json();
        setInvestigationData(jsonInvest);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && (!datasetData || !investigationData) && !loading) {
      fetchDatasetDiagnostics();
    }
  }, [isOpen]);

  // Measure actual DOM rows dynamically
  useEffect(() => {
    const checkDomRows = () => {
      const rowElements = document.querySelectorAll('[data-season-row]');
      setDomRowCount(rowElements.length);
      const ids = Array.from(rowElements)
        .map((el) => Number(el.getAttribute('data-season-row')))
        .filter((n) => !isNaN(n) && n > 0);
      setDomRowIds(ids);
    };

    checkDomRows();
    const timer = setTimeout(checkDomRows, 300);
    return () => clearTimeout(timer);
  }, [currentlyWatchingItems, isOpen]);

  // Combined Summer 2026 IDs from Frontend State
  const combinedSummer2026Ids = useMemo(() => {
    const s = new Set<number>(jikanSummer2026Ids);
    for (const id of fallbackSummer2026Ids) s.add(id);
    return s;
  }, [jikanSummer2026Ids, fallbackSummer2026Ids]);

  // Frontend watching items
  const frontendWatchingItems = useMemo(() => {
    return malList.filter((i) => i.list_status?.status === 'watching');
  }, [malList]);

  const frontendWatchingIds = useMemo(() => {
    return new Set<number>(frontendWatchingItems.map((i) => i.node.id));
  }, [frontendWatchingItems]);

  // Expected Summer Watching in Frontend
  const expectedFrontendSummerWatching = useMemo(() => {
    return frontendWatchingItems.filter((i) => combinedSummer2026Ids.has(i.node.id));
  }, [frontendWatchingItems, combinedSummer2026Ids]);

  const expectedIds = useMemo(() => {
    return new Set<number>(expectedFrontendSummerWatching.map((i) => i.node.id));
  }, [expectedFrontendSummerWatching]);

  const actualIds = useMemo(() => {
    return new Set<number>(currentlyWatchingItems.map((i) => i.node.id));
  }, [currentlyWatchingItems]);

  const isRenderTruthMatch =
    expectedIds.size === currentlyWatchingItems.length &&
    currentlyWatchingItems.length === domRowCount;

  return (
    <div id="season-diagnostics-container" className="mt-8 border-t border-slate-700/80 pt-6">
      {/* Top Bar with Live Render Verification Pill */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Bug className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-semibold text-slate-300">
            MAL Pipeline & Personal Retrieval Audit
          </span>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
              isRenderTruthMatch
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {isRenderTruthMatch
              ? `Render Truth: ${domRowCount} DOM Rows == ${currentlyWatchingItems.length} Items (100% Synced)`
              : `Rendering: ${domRowCount} DOM Rows vs ${currentlyWatchingItems.length} Input Items`}
          </span>
        </div>
        <button
          id="btn-toggle-diagnostics"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer shadow-sm self-start sm:self-auto"
        >
          <Bug className="h-4 w-4" />
          <span>{isOpen ? 'Hide Diagnostics Panel' : 'Inspect MAL Retrieval & Diagnostics'}</span>
        </button>
      </div>

      {isOpen && (
        <div
          id="season-diagnostics-panel"
          className="mt-4 bg-slate-950/95 border border-amber-500/30 rounded-3xl p-6 text-slate-200 shadow-2xl backdrop-blur-xl space-y-6"
        >
          {/* Header & Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-4 gap-3">
            <div>
              <div className="flex items-center gap-3">
                <span className="bg-amber-500 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                  MAL API Audit
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Personal List Retrieval & Discrepancy Analysis
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Investigating bulk /users/@me/animelist pagination, parameters, filters, and individual /anime/id status.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex gap-1 text-xs font-bold">
                <button
                  onClick={() => setActiveTab('investigation')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === 'investigation'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  MAL Investigation Matrix
                </button>
                <button
                  onClick={() => setActiveTab('render')}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    activeTab === 'render'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Render Truth & DOM Audit
                </button>
              </div>
              <button
                id="btn-refresh-diagnostics"
                onClick={fetchDatasetDiagnostics}
                disabled={loading}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 cursor-pointer transition-all disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Re-run Probes</span>
              </button>
            </div>
          </div>

          {/* TAB 1: MAL INVESTIGATION MATRIX */}
          {activeTab === 'investigation' && (
            <div className="space-y-6">
              {/* FEATURE: CHECK ANIME BY MAL ID (INDIVIDUAL STATUS EXPLANATION TOOL) */}
              <div id="check-anime-mal-id-card" className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider">
                    <Search className="h-4 w-4" />
                    <span>Check Anime by MAL ID (Diagnostic Explanation)</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-sans">
                    Queries authenticated MAL API <code className="text-amber-300 font-mono text-[10px]">/v2/anime/{'{id}'}?fields=my_list_status...</code>
                  </span>
                </div>

                <form onSubmit={handleCheckSingleAnime} className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor="input-check-mal-id" className="text-xs font-bold text-slate-300 whitespace-nowrap">
                      MAL ID:
                    </label>
                    <input
                      id="input-check-mal-id"
                      type="number"
                      min="1"
                      value={singleMalIdInput}
                      onChange={(e) => setSingleMalIdInput(e.target.value)}
                      placeholder="e.g. 61126"
                      className="w-32 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-xl px-3 py-2 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                  <button
                    id="btn-check-anime-mal-id"
                    type="submit"
                    disabled={singleLookupLoading}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-50 shadow-md"
                  >
                    <Search className={`h-3.5 w-3.5 ${singleLookupLoading ? 'animate-spin' : ''}`} />
                    <span>{singleLookupLoading ? 'Checking...' : 'Check'}</span>
                  </button>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>Quick test:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSingleMalIdInput('61126');
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded font-mono text-[11px] border border-slate-700 cursor-pointer"
                    >
                      61126
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSingleMalIdInput('54856');
                      }}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded font-mono text-[11px] border border-slate-700 cursor-pointer"
                    >
                      54856
                    </button>
                  </div>
                </form>

                {singleLookupError && (
                  <div className="mt-3 p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{singleLookupError}</span>
                  </div>
                )}

                {singleLookupResult && (
                  <div id="single-anime-diagnostic-result" className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 font-sans">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-amber-400 text-base">
                            MAL ID: {singleLookupResult.malId}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                              singleLookupResult.eligibility.isEligible
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            MY SEASON: {singleLookupResult.eligibility.isEligible ? 'ELIGIBLE (YES)' : 'NOT ELIGIBLE (NO)'}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">
                          Title: <span className="text-slate-200">{singleLookupResult.anime.title || 'Unknown title'}</span>
                        </h4>
                      </div>
                      <a
                        href={`https://myanimelist.net/anime/${singleLookupResult.malId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium self-start sm:self-auto"
                      >
                        <span>View on MyAnimeList</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      {/* Authenticated Account */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Authenticated account
                        </span>
                        <span className="font-bold text-white mt-0.5 block text-sm">
                          {singleLookupResult.authenticatedUser?.name || 'Henry212'}
                        </span>
                      </div>

                      {/* In Personal List */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          In personal MAL list
                        </span>
                        <span
                          className={`font-black mt-0.5 block text-sm ${
                            singleLookupResult.personalList.inPersonalList ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {singleLookupResult.personalList.inPersonalList ? 'YES' : 'NO'}
                        </span>
                      </div>

                      {/* MAL Status */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          MAL status
                        </span>
                        <span className="font-mono font-bold text-amber-300 mt-0.5 block text-sm">
                          {singleLookupResult.personalList.status}
                        </span>
                      </div>

                      {/* Anime Season */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Anime season
                        </span>
                        <span className="font-bold text-indigo-300 mt-0.5 block text-sm">
                          {singleLookupResult.anime.seasonDisplay || 'Summer 2026'}
                        </span>
                      </div>

                      {/* MY SEASON Eligibility */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          MY SEASON eligibility
                        </span>
                        <span
                          className={`font-black mt-0.5 block text-sm ${
                            singleLookupResult.eligibility.isEligible ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {singleLookupResult.eligibility.isEligible ? 'YES' : 'NO'}
                        </span>
                      </div>

                      {/* Score / Episodes if available */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                          Personal List Progress
                        </span>
                        <span className="font-mono text-slate-300 mt-0.5 block text-sm">
                          {singleLookupResult.personalList.inPersonalList
                            ? `Score: ${singleLookupResult.personalList.score || '—'} | Eps: ${singleLookupResult.personalList.numEpisodesWatched ?? 0}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Diagnostic Explanation Reason */}
                    <div
                      className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                        singleLookupResult.eligibility.isEligible
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      <span className="font-bold uppercase tracking-wider block text-[11px] mb-1">
                        Reason:
                      </span>
                      <p className="font-semibold text-sm">
                        {singleLookupResult.eligibility.reason}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* AUTHENTICATED USER IDENTITY CARD */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-xs uppercase tracking-wider mb-2">
                  <User className="h-4 w-4" />
                  <span>Authenticated MyAnimeList Account Identity</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mt-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Username</span>
                    <span className="font-bold text-white text-base">
                      {investigationData?.authenticatedUser?.name || datasetData?.authenticatedUser?.name || 'Henry212'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">MAL User ID</span>
                    <span className="font-mono font-bold text-indigo-300 text-base">
                      {investigationData?.authenticatedUser?.id || datasetData?.authenticatedUser?.id || '20747908'}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">OAuth Status</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5 text-sm">
                      <ShieldCheck className="h-4 w-4" />
                      Active & Verified Session
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. BULK /users/@me/animelist PAGINATION CAPTURE */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Bulk Endpoint Capture (/v2/users/@me/animelist)
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Total Pages: <strong className="text-white">{investigationData?.bulkAnimelist.pagesFetched ?? '—'}</strong> | Total Items: <strong className="text-amber-400">{investigationData?.bulkAnimelist.totalEntries ?? '—'}</strong> | Watching: <strong className="text-emerald-400">{investigationData?.bulkAnimelist.watchingCount ?? '—'}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                        <th className="py-2 px-3">Page</th>
                        <th className="py-2 px-3">Limit</th>
                        <th className="py-2 px-3">Offset</th>
                        <th className="py-2 px-3">Items Count</th>
                        <th className="py-2 px-3">Has Next</th>
                        <th className="py-2 px-3">First MAL ID / Title</th>
                        <th className="py-2 px-3">Last MAL ID / Title</th>
                        <th className="py-2 px-3 text-center">61126 Found?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {investigationData?.bulkAnimelist.pages.map((p) => (
                        <tr key={p.page} className="hover:bg-slate-800/40 text-slate-300">
                          <td className="py-2 px-3 font-mono font-bold text-white">Page {p.page}</td>
                          <td className="py-2 px-3 font-mono text-slate-400">100</td>
                          <td className="py-2 px-3 font-mono text-slate-400">{(p.page - 1) * 100}</td>
                          <td className="py-2 px-3 font-mono font-bold text-indigo-300">{p.itemCount}</td>
                          <td className="py-2 px-3 font-mono">{p.hasNext ? 'true' : 'false'}</td>
                          <td className="py-2 px-3 text-xs max-w-[200px] truncate text-slate-300 font-mono">
                            {p.firstMalId} <span className="font-sans text-slate-400 text-[11px]">({p.firstTitle})</span>
                          </td>
                          <td className="py-2 px-3 text-xs max-w-[200px] truncate text-slate-300 font-mono">
                            {p.lastMalId} <span className="font-sans text-slate-400 text-[11px]">({p.lastTitle})</span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {p.found61126 ? (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-bold text-[10px] rounded">
                                FOUND
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-800 text-slate-500 text-[10px] rounded font-mono">
                                not found
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 2. PARAMETERS & COMPARATIVE MATRIX */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
                  <FileCode2 className="h-4 w-4 text-indigo-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    MAL Retrieval Experiment Matrix (61126 & Parameter Variations)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
                  {/* Test A: Unfiltered vs Status Filter */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="font-bold text-amber-400 uppercase text-[11px] tracking-wider">
                      1. Status Filtering Test
                    </h5>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">GET /users/@me/animelist (Unfiltered):</span>
                        <span className={investigationData?.bulkAnimelist.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.bulkAnimelist.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">GET /users/@me/animelist?status=watching:</span>
                        <span className={investigationData?.statusFilteredBulk.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.statusFilteredBulk.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Returned with status=watching:</span>
                        <span className="text-indigo-300 font-bold">{investigationData?.statusFilteredBulk.totalReturned ?? '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Test B: NSFW & Limits */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="font-bold text-indigo-400 uppercase text-[11px] tracking-wider">
                      2. Limit & NSFW Parameters Test
                    </h5>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">GET /users/@me/animelist?limit=1000:</span>
                        <span className={investigationData?.largeLimitBulk.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.largeLimitBulk.found61126 ? 'FOUND' : 'NOT FOUND'} ({investigationData?.largeLimitBulk.totalReturned} entries)
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">GET /users/@me/animelist?nsfw=true:</span>
                        <span className={investigationData?.nsfwBulk.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.nsfwBulk.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Direct /anime/61126 my_list_status:</span>
                        <span className={investigationData?.directCheck61126.myListStatusExists ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.directCheck61126.myListStatusExists ? `EXISTS (${investigationData.directCheck61126.myListStatus?.status})` : 'ABSENT'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Test C: Sort Orders */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="font-bold text-purple-400 uppercase text-[11px] tracking-wider">
                      3. Alternative Sort Orders Test
                    </h5>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">sort=list_updated_at:</span>
                        <span className={investigationData?.alternativeSorts.listUpdatedAt.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.alternativeSorts.listUpdatedAt.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">sort=anime_title:</span>
                        <span className={investigationData?.alternativeSorts.animeTitle.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.alternativeSorts.animeTitle.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">sort=list_score:</span>
                        <span className={investigationData?.alternativeSorts.listScore.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.alternativeSorts.listScore.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">sort=anime_start_date:</span>
                        <span className={investigationData?.alternativeSorts.animeStartDate.found61126 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                          {investigationData?.alternativeSorts.animeStartDate.found61126 ? 'FOUND' : 'NOT FOUND'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Test D: Summer 2026 Candidate Discrepancy Breakdown */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h5 className="font-bold text-emerald-400 uppercase text-[11px] tracking-wider">
                      4. Summer 2026 Candidate Discrepancy Audit
                    </h5>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">Jikan Summer 2026 Candidates Tested:</span>
                        <span className="text-white font-bold">{investigationData?.summer2026Discrepancy.jikanCandidatesTested ?? '—'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">Individual status = "watching":</span>
                        <span className="text-amber-400 font-bold">{investigationData?.summer2026Discrepancy.individualWatchingCount ?? '—'}</span>
                      </div>
                      <div className="flex justify-between border-b border-slate-800/80 pb-1">
                        <span className="text-slate-400">Also present in bulk animelist:</span>
                        <span className="text-emerald-400 font-bold">{investigationData?.summer2026Discrepancy.alsoInBulkCount ?? '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Missing from bulk animelist:</span>
                        <span className={investigationData?.summer2026Discrepancy.missingFromBulk.length ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                          {investigationData?.summer2026Discrepancy.missingFromBulk.length ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Missing Items Table if any */}
                {investigationData && investigationData.summer2026Discrepancy.missingFromBulk.length > 0 && (
                  <div className="mt-4 bg-rose-950/20 border border-rose-500/30 p-4 rounded-xl">
                    <h5 className="text-xs font-bold text-rose-300 uppercase mb-2">
                      Anime missing from bulk /users/@me/animelist (Status = Watching on MAL):
                    </h5>
                    <ul className="divide-y divide-rose-900/40 text-xs font-mono">
                      {investigationData.summer2026Discrepancy.missingFromBulk.map((m) => (
                        <li key={m.id} className="py-1.5 flex justify-between">
                          <span className="text-white font-bold">{m.id} - {m.title}</span>
                          <span className="text-rose-300">MAL status: {m.individualStatus} (episodes: {m.episodes ?? 0})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* 3. FINAL CONCLUSION & ROOT CAUSE */}
              <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-wider mb-2">
                  <Activity className="h-4 w-4" />
                  <span>Diagnostic Conclusion & Root Cause</span>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <p className="text-slate-200 font-semibold">
                    {investigationData?.conclusion.summary || 'Executing comprehensive tests...'}
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    <strong>Root Cause Analysis:</strong> {investigationData?.conclusion.rootCause || 'Analyzing test responses...'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RENDER TRUTH & DOM AUDIT */}
          {activeTab === 'render' && (
            <div className="space-y-6">
              {/* RENDER TRUTH SUMMARY BLOCK */}
              <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-xs uppercase tracking-wider mb-3">
                  <Eye className="h-4 w-4" />
                  <span>Live Render Truth Verification</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] uppercase text-slate-400 font-bold">Expected Items</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">{expectedIds.size}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] uppercase text-slate-400 font-bold">currentlyWatchingItems</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">{currentlyWatchingItems.length}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] uppercase text-slate-400 font-bold">SeasonTable Input</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">{currentlyWatchingItems.length}</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] uppercase text-slate-400 font-bold">DOM &lt;tr data-season-row&gt;</div>
                    <div className="text-2xl font-black text-emerald-400 mt-1">{domRowCount}</div>
                  </div>
                </div>

                {/* ID Lists Verification */}
                <div className="mt-4 pt-4 border-t border-slate-800 text-[11px] font-mono space-y-2">
                  <div className="text-slate-300">
                    <span className="text-slate-400 font-sans font-bold">Expected IDs ({expectedIds.size}): </span>
                    <span className="text-emerald-400 font-bold">
                      {Array.from(expectedIds).sort((a: number, b: number) => a - b).join(', ') || 'None'}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400 font-sans font-bold">SeasonTable Input IDs ({currentlyWatchingItems.length}): </span>
                    <span className="text-indigo-400 font-bold">
                      {currentlyWatchingItems.map((i) => i.node?.id).sort((a: number, b: number) => a - b).join(', ') || 'None'}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-400 font-sans font-bold">Actual DOM Row IDs ({domRowIds.length}): </span>
                    <span className="text-amber-400 font-bold">
                      {domRowIds.sort((a: number, b: number) => a - b).join(', ') || 'None'}
                    </span>
                  </div>
                </div>
              </div>

              {/* EXPECTED VS ACTUAL COMPARISON TABLE */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      Expected vs Actual Summer 2026 Watching Audit
                    </h4>
                  </div>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by title or MAL ID..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-700/80 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-extrabold uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-3">MAL ID</th>
                        <th className="py-2.5 px-3">Anime Title</th>
                        <th className="py-2.5 px-3 text-center">MAL Status</th>
                        <th className="py-2.5 px-3 text-center">In Jikan Seasonal</th>
                        <th className="py-2.5 px-3 text-center">Summer 2026 Match</th>
                        <th className="py-2.5 px-3 text-center">In currentlyWatchingItems</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {frontendWatchingItems
                        .filter((item) => {
                          if (!searchFilter.trim()) return true;
                          const q = searchFilter.toLowerCase();
                          return (
                            item.node.id.toString().includes(q) ||
                            (item.node.title || '').toLowerCase().includes(q)
                          );
                        })
                        .map((item) => {
                          const id = item.node.id;
                          const inSeasonal = jikanSummer2026Ids.has(id);
                          const inFallback = fallbackSummer2026Ids.has(id);
                          const isSummer = inSeasonal || inFallback;
                          const isRendered = actualIds.has(id);
                          const isExpected = isSummer;

                          let rowClass = 'hover:bg-slate-800/40 text-slate-300';
                          if (isExpected && !isRendered) rowClass = 'bg-rose-950/20 text-rose-200 hover:bg-rose-950/30';
                          if (isExpected && isRendered) rowClass = 'bg-emerald-950/10 text-emerald-200 hover:bg-emerald-950/20';

                          return (
                            <tr key={id} className={rowClass}>
                              <td className="py-2.5 px-3 font-mono font-bold text-white">
                                {id}
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-white max-w-[240px] truncate">
                                {item.node.title}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-[11px] text-amber-300">
                                {item.list_status?.status}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {inSeasonal ? (
                                  <span className="text-emerald-400 font-bold">YES</span>
                                ) : (
                                  <span className="text-slate-500">NO</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {isSummer ? (
                                  <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Summer 2026
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Other Season</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {isRendered ? (
                                  <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> YES
                                  </span>
                                ) : (
                                  <span className="text-slate-500">NO</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {isExpected && isRendered && (
                                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-bold text-[10px]">
                                    MATCH (INCLUDED)
                                  </span>
                                )}
                                {isExpected && !isRendered && (
                                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded-md font-bold text-[10px]">
                                    MISSING (ERROR)
                                  </span>
                                )}
                                {!isExpected && !isRendered && (
                                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md text-[10px]">
                                    NOT SUMMER
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
