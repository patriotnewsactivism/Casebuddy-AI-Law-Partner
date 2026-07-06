import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { AppContext } from '../App';
import {
  Search, BookOpen, Plus, Trash2, Edit3, Eye, ThumbsUp, Clock, Tag,
  Folder, TrendingUp, Zap, Loader2, Filter, X, ChevronRight,
  ArrowLeft, Copy, Download, Star, FileText, Hash, BarChart3, BrainCircuit
} from 'lucide-react';
import {
  getArticles, saveArticle, deleteArticle, getArticleById,
  searchArticles as searchKB, getArticlesByCase,
  getAllTags, getCategoryCounts, generateArticleFromCase,
  suggestRelatedArticles, getRecentArticles, getPopularArticles, getCategoryInfo
} from '../services/knowledgeBaseService';
import type { KBArticle, KBArticleStatus, KBCategory, KBSearchResult, KBCategoryInfo } from '../types';
import { KB_CATEGORIES } from '../types';

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const CATEGORY_COLORS: Record<KBCategory, string> = {
  'case-strategy': 'bg-amber-500/15 border-amber-500/30 text-amber-400',
  'motion-drafting': 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  'evidence-rules': 'bg-purple-500/15 border-purple-500/30 text-purple-400',
  'discovery': 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400',
  'witness-examination': 'bg-green-500/15 border-green-500/30 text-green-400',
  'jury-selection': 'bg-pink-500/15 border-pink-500/30 text-pink-400',
  'constitutional-law': 'bg-red-500/15 border-red-500/30 text-red-400',
  'criminal-procedure': 'bg-orange-500/15 border-orange-500/30 text-orange-400',
  'civil-procedure': 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400',
  'appellate': 'bg-violet-500/15 border-violet-500/30 text-violet-400',
  'settlement': 'bg-teal-500/15 border-teal-500/30 text-teal-400',
  'trial-technique': 'bg-rose-500/15 border-rose-500/30 text-rose-400',
  'legal-research': 'bg-sky-500/15 border-sky-500/30 text-sky-400',
  'client-management': 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
  'firm-operations': 'bg-slate-500/15 border-slate-500/30 text-slate-400',
};

const CategoryBadge: React.FC<{ category: KBCategory }> = ({ category }) => {
  const info = KB_CATEGORIES.find(c => c.id === category);
  const colorClass = CATEGORY_COLORS[category] || 'bg-slate-500/15 border-slate-500/30 text-slate-400';
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${colorClass}`}>
      {info?.icon} {info?.label || category}
    </span>
  );
};

const TagPill: React.FC<{ label: string; onRemove?: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
    {label}
    {onRemove && (
      <button onClick={onRemove} className="hover:text-gold-400 transition-colors">
        <X size={10} />
      </button>
    )}
  </span>
);

interface ArticleCardProps {
  article: KBArticle;
  onClick: () => void;
  relevanceScore?: number;
  snippet?: string;
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article, onClick, relevanceScore, snippet }) => (
  <button
    onClick={onClick}
    className="w-full text-left p-4 rounded-xl bg-slate-900 border border-slate-700/50 hover:border-gold-500/30 transition-all duration-200 group"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-slate-200 group-hover:text-gold-400 transition-colors truncate">
          {article.title}
        </h3>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <CategoryBadge category={article.category} />
          {article.tags.slice(0, 3).map(t => (
            <TagPill key={t} label={t} />
          ))}
          {article.tags.length > 3 && (
            <span className="text-xs text-slate-500">+{article.tags.length - 3}</span>
          )}
        </div>
        {snippet && (
          <p className="text-xs text-slate-400 mt-2 line-clamp-2">{snippet}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {relevanceScore !== undefined && (
          <span className="text-xs font-semibold text-gold-500">{relevanceScore}% match</span>
        )}
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Eye size={12} /> {article.viewCount}</span>
          <span className="flex items-center gap-1"><ThumbsUp size={12} /> {article.helpfulCount}</span>
        </div>
      </div>
    </div>
  </button>
);

const KnowledgeBase: React.FC = () => {
  const { activeCase } = useContext(AppContext);

  const [view, setView] = useState<'browse' | 'search' | 'detail'>('browse');
  const [articles, setArticles] = useState<KBArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<KBCategory | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<KBArticle | null>(null);
  const [relatedArticles, setRelatedArticles] = useState<KBArticle[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<{ category: KBCategory; label: string; count: number; icon: string }[]>([]);
  const [popularArticles, setPopularArticles] = useState<KBArticle[]>([]);
  const [recentArticles, setRecentArticles] = useState<KBArticle[]>([]);
  const [caseArticles, setCaseArticles] = useState<KBArticle[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateCategory, setGenerateCategory] = useState<KBCategory>('case-strategy');
  const [generateTopic, setGenerateTopic] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [editingArticle, setEditingArticle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState<KBCategory>('case-strategy');
  const [editTags, setEditTags] = useState('');
  const [editStatus, setEditStatus] = useState<'draft' | 'published' | 'archived'>('draft');
  const [tempTagInput, setTempTagInput] = useState('');

  const loadData = useCallback(() => {
    const all = getArticles();
    setArticles(all);
    setAllTags(getAllTags());
    setCategoryCounts(getCategoryCounts());
    setPopularArticles(getPopularArticles(5));
    setRecentArticles(getRecentArticles(5));
    if (activeCase) {
      setCaseArticles(getArticlesByCase(activeCase.id));
    } else {
      setCaseArticles([]);
    }
  }, [activeCase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredArticles = useMemo(() => {
    if (selectedCategory) {
      return articles.filter(a => a.category === selectedCategory);
    }
    return articles;
  }, [articles, selectedCategory]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = searchKB(searchQuery, selectedCategory ?? undefined, 30);
    setSearchResults(results);
    setView('search');
    setIsSearching(false);
  }, [searchQuery, selectedCategory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const openArticle = useCallback((article: KBArticle) => {
    const fresh = getArticleById(article.id);
    if (fresh) {
      setSelectedArticle(fresh);
      setRelatedArticles(suggestRelatedArticles(fresh.id, 5));
      setView('detail');
      setEditingArticle(false);
    }
  }, []);

  const handleDeleteArticle = useCallback(() => {
    if (!selectedArticle) return;
    deleteArticle(selectedArticle.id);
    setSelectedArticle(null);
    setView('browse');
    loadData();
  }, [selectedArticle, loadData]);

  const handleMarkHelpful = useCallback(() => {
    if (!selectedArticle) return;
    const updated = { ...selectedArticle, helpfulCount: selectedArticle.helpfulCount + 1 };
    saveArticle(updated);
    setSelectedArticle(updated);
  }, [selectedArticle]);

  const handleCopyContent = useCallback(() => {
    if (!selectedArticle) return;
    navigator.clipboard.writeText(selectedArticle.content).catch(() => {});
  }, [selectedArticle]);

  const handleEditSave = useCallback(() => {
    if (!selectedArticle) return;
    const tags = editTags.split(',').map(t => t.trim()).filter(Boolean);
    const updated: KBArticle = {
      ...selectedArticle,
      title: editTitle,
      content: editContent,
      category: editCategory,
      tags,
      status: editStatus,
    };
    saveArticle(updated);
    setSelectedArticle(updated);
    setEditingArticle(false);
    loadData();
  }, [selectedArticle, editTitle, editContent, editCategory, editTags, editStatus, loadData]);

  const startEditing = useCallback(() => {
    if (!selectedArticle) return;
    setEditTitle(selectedArticle.title);
    setEditContent(selectedArticle.content);
    setEditCategory(selectedArticle.category);
    setEditTags(selectedArticle.tags.join(', '));
    setEditStatus(selectedArticle.status);
    setEditingArticle(true);
  }, [selectedArticle]);

  const handleGenerate = useCallback(async () => {
    if (!activeCase) return;
    setGenerating(true);
    setGenerateError('');
    try {
      const newArticle = await generateArticleFromCase(
        activeCase.title,
        activeCase.summary || '',
        generateCategory,
        generateTopic || undefined
      );
      newArticle.relatedCaseIds = [activeCase.id];
      newArticle.status = 'draft';
      saveArticle(newArticle);
      setShowGenerateModal(false);
      setGenerateTopic('');
      loadData();
      openArticle(newArticle);
    } catch {
      setGenerateError('Failed to generate article. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [activeCase, generateCategory, generateTopic, loadData, openArticle]);

  const goToBrowse = () => {
    setView('browse');
    setSearchResults([]);
    setSearchQuery('');
    setSelectedArticle(null);
  };

  const clearCategory = () => setSelectedCategory(null);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'bg-slate-700 border-slate-600 text-slate-300',
      published: 'bg-green-500/15 border-green-500/30 text-green-400',
      archived: 'bg-slate-700/50 border-slate-600/50 text-slate-500',
    };
    return map[status] || map.draft;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ─── BROWSE VIEW ─────────────────────────────────────────────────── */}
      {view === 'browse' && (
        <>
          <div className="text-center space-y-3 py-6">
            <div className="flex items-center justify-center gap-3">
              <BookOpen size={32} className="text-gold-500" />
              <h1 className="text-3xl font-bold text-white">Knowledge Base</h1>
            </div>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              Firm precedent, legal strategies, and AI-curated research
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <div className="relative w-full max-w-lg">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search articles, tags, or legal topics..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30 transition-all text-sm"
                />
              </div>
              {activeCase && (
                <button
                  onClick={() => setShowGenerateModal(true)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 transition-all shrink-0 text-sm font-medium"
                >
                  <Zap size={16} />
                  Generate Article
                </button>
              )}
            </div>
          </div>

          {/* Category grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Folder size={18} className="text-gold-500" />
                Categories
              </h2>
              {selectedCategory && (
                <button onClick={clearCategory} className="text-sm text-gold-400 hover:text-gold-300 flex items-center gap-1">
                  <X size={14} /> Clear filter
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                onClick={clearCategory}
                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                  !selectedCategory
                    ? 'bg-slate-900 border-gold-500/50 ring-1 ring-gold-500/20'
                    : 'bg-slate-900 border-slate-700/50 hover:border-gold-500/30'
                }`}
              >
                <div className="text-2xl mb-1">📚</div>
                <div className="text-sm font-semibold text-slate-200">All Articles</div>
                <div className="text-xs text-slate-500">{articles.length} articles</div>
              </button>
              {categoryCounts.map(c => (
                <button
                  key={c.category}
                  onClick={() => setSelectedCategory(c.category)}
                  className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                    selectedCategory === c.category
                      ? 'bg-slate-900 border-gold-500/50 ring-1 ring-gold-500/20'
                      : 'bg-slate-900 border-slate-700/50 hover:border-gold-500/30'
                  }`}
                >
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <div className="text-sm font-semibold text-slate-200">{c.label}</div>
                  <div className="text-xs text-slate-500">{c.count} article{c.count !== 1 ? 's' : ''}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Two-column: Popular + Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <TrendingUp size={18} className="text-gold-500" />
                Popular Articles
              </h2>
              {popularArticles.length === 0 ? (
                <p className="text-slate-500 text-sm py-6 text-center bg-slate-900 rounded-xl border border-slate-800">
                  No articles yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {popularArticles.map(a => (
                    <ArticleCard key={a.id} article={a} onClick={() => openArticle(a)} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Clock size={18} className="text-gold-500" />
                Recent Articles
              </h2>
              {recentArticles.length === 0 ? (
                <p className="text-slate-500 text-sm py-6 text-center bg-slate-900 rounded-xl border border-slate-800">
                  No articles yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentArticles.map(a => (
                    <ArticleCard key={a.id} article={a} onClick={() => openArticle(a)} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Case-related articles */}
          {activeCase && (
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Star size={18} className="text-gold-500" />
                From This Case
              </h2>
              {caseArticles.length === 0 ? (
                <div className="text-center py-8 bg-slate-900 rounded-xl border border-slate-800">
                  <p className="text-slate-400 text-sm mb-3">
                    No articles linked to this case yet.
                  </p>
                  <button
                    onClick={() => setShowGenerateModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 transition-all text-sm"
                  >
                    <Zap size={14} /> Generate from case learnings
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {caseArticles.map(a => (
                    <ArticleCard key={a.id} article={a} onClick={() => openArticle(a)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {articles.length === 0 && (
            <div className="text-center py-12">
              <BookOpen size={48} className="text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 text-sm max-w-md mx-auto">
                Your knowledge base is empty. CaseBuddy agents will populate it as they work on cases, or you can generate an article from an active case.
              </p>
            </div>
          )}
        </>
      )}

      {/* ─── SEARCH VIEW ──────────────────────────────────────────────────── */}
      {view === 'search' && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={goToBrowse}
              className="flex items-center gap-1 text-slate-400 hover:text-gold-400 transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30 transition-all text-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4 flex-wrap">
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gold-500/10 border border-gold-500/30 text-gold-400">
                {KB_CATEGORIES.find(c => c.id === selectedCategory)?.icon} {KB_CATEGORIES.find(c => c.id === selectedCategory)?.label}
                <button onClick={clearCategory}>
                  <X size={12} />
                </button>
              </span>
            )}
            <span className="text-sm text-slate-500">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</span>
          </div>

          {isSearching ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="text-gold-500 animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="text-center py-12">
              <Search size={48} className="text-slate-700 mx-auto mb-4" />
              <p className="text-slate-400 text-sm">
                No articles found for <span className="text-gold-400">'{searchQuery}'</span>. Try different keywords or generate a new article.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map(r => {
                const snippet = r.article.content.slice(0, 120);
                return (
                  <ArticleCard
                    key={r.article.id}
                    article={r.article}
                    onClick={() => openArticle(r.article)}
                    relevanceScore={r.relevanceScore}
                    snippet={snippet}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── DETAIL VIEW ──────────────────────────────────────────────────── */}
      {view === 'detail' && selectedArticle && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={goToBrowse}
              className="flex items-center gap-1 text-slate-400 hover:text-gold-400 transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {!editingArticle && (
                <>
                  <button
                    onClick={startEditing}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-gold-500/30 hover:text-gold-400 transition-all text-xs"
                  >
                    <Edit3 size={13} /> Edit
                  </button>
                  <button
                    onClick={handleDeleteArticle}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all text-xs"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                  <button
                    onClick={handleCopyContent}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-gold-500/30 hover:text-gold-400 transition-all text-xs"
                  >
                    <Copy size={13} /> Copy
                  </button>
                  <button
                    onClick={handleMarkHelpful}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-green-500/30 hover:text-green-400 transition-all text-xs"
                  >
                    <ThumbsUp size={13} /> Helpful
                  </button>
                </>
              )}
            </div>
          </div>

          {editingArticle ? (
            <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-gold-500/50 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value as KBCategory)}
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-gold-500/50 text-sm"
                  >
                    {KB_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as 'draft' | 'published' | 'archived')}
                    className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-gold-500/50 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="e.g. motion, dismissal, evidence"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Content</label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={16}
                  className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-gold-500/50 text-sm resize-y font-mono"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleEditSave}
                  className="px-4 py-2 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 transition-all text-sm font-medium"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => setEditingArticle(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300 transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white mb-4">{selectedArticle.title}</h1>

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge(selectedArticle.status)}`}>
                  {selectedArticle.status}
                </span>
                <CategoryBadge category={selectedArticle.category} />
                {selectedArticle.tags.map(t => (
                  <TagPill key={t} label={t} />
                ))}
                <span className="text-xs text-slate-500">{selectedArticle.author}</span>
                <span className="text-xs text-slate-500">{formatDate(selectedArticle.updatedAt)}</span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Eye size={12} /> {selectedArticle.viewCount}
                </span>
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <ThumbsUp size={12} /> {selectedArticle.helpfulCount}
                </span>
              </div>

              <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-6 mb-6">
                <div className="prose prose-invert max-w-3xl leading-relaxed text-slate-200 whitespace-pre-wrap text-sm">
                  {selectedArticle.content}
                </div>
              </div>
            </>
          )}

          {/* Related articles */}
          {relatedArticles.length > 0 && !editingArticle && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <ChevronRight size={18} className="text-gold-500" />
                Related Articles
              </h3>
              <div className="space-y-2">
                {relatedArticles.map(a => (
                  <ArticleCard key={a.id} article={a} onClick={() => openArticle(a)} />
                ))}
              </div>
            </div>
          )}

          {/* Linked cases */}
          {selectedArticle.relatedCaseIds.length > 0 && !editingArticle && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Hash size={18} className="text-gold-500" />
                Linked Cases
              </h3>
              <div className="bg-slate-900 rounded-xl border border-slate-700/50 p-4">
                <div className="flex flex-wrap gap-2">
                  {selectedArticle.relatedCaseIds.map(caseId => (
                    <span key={caseId} className="text-xs px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                      {caseId}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── GENERATE MODAL ───────────────────────────────────────────────── */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Zap size={20} className="text-gold-500" />
                Generate Article from Case
              </h2>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">
                Extract knowledge from: <span className="text-gold-400 font-medium">{activeCase?.title}</span>
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select
                  value={generateCategory}
                  onChange={e => setGenerateCategory(e.target.value as KBCategory)}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 focus:outline-none focus:border-gold-500/50 text-sm"
                >
                  {KB_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Topic <span className="text-slate-600">(optional — narrows AI focus)</span>
                </label>
                <input
                  type="text"
                  value={generateTopic}
                  onChange={e => setGenerateTopic(e.target.value)}
                  placeholder="e.g. Fourth Amendment suppression arguments"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-gold-500/50 text-sm"
                />
              </div>

              {generateError && (
                <p className="text-sm text-red-400">{generateError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gold-500/10 border border-gold-500/30 text-gold-400 hover:bg-gold-500/20 transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Zap size={16} />
                  )}
                  {generating ? 'Generating...' : 'Generate Article'}
                </button>
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-5 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-300 transition-all text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
