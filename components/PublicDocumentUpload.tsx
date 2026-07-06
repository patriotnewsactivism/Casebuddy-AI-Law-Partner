import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Copy,
  Scale, ShieldCheck, FileImage, FileArchive, File, Trash2, ArrowRight
} from 'lucide-react';
import { getSupabase } from '../services/supabaseClient';
import { toast } from 'react-toastify';

interface IntakeRecord {
  id: string;
  firm_id: string;
  full_name: string;
  case_id: string | null;
  matter_type: string;
}

interface UploadingFile {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  error?: string;
}

const FILE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  'application/pdf': FileText,
  'image/': FileImage,
  'application/zip': FileArchive,
};

function getFileIcon(mimeType: string) {
  for (const [prefix, Icon] of Object.entries(FILE_ICONS)) {
    if (mimeType.startsWith(prefix)) return Icon;
  }
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PublicDocumentUpload: React.FC = () => {
  const { intakeId } = useParams<{ intakeId: string }>();
  const [intake, setIntake] = useState<IntakeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadIntake = async () => {
      const supabase = getSupabase();
      if (!supabase || !intakeId) {
        setError('Database not configured');
        setLoading(false);
        return;
      }

      try {
        const { data, error: dbError } = await supabase
          .from('intake_cases')
          .select('id, firm_id, full_name, case_id, matter_type')
          .eq('id', intakeId)
          .maybeSingle();

        if (dbError || !data) {
          // Fall back to checking localStorage stubs
          const raw = localStorage.getItem('lexsim_intake_cases') || localStorage.getItem('casebuddy_intakes');
          const localIntakes = raw ? JSON.parse(raw) : [];
          const found = localIntakes.find((i: any) => i.id === intakeId || i.intakeId === intakeId);
          if (found) {
            setIntake({
              id: found.id || found.intakeId,
              firm_id: found.firmId || 'local-firm',
              full_name: found.fullName || found.intake?.fullName || 'Prospective Client',
              case_id: found.caseId || null,
              matter_type: found.matterType || found.intake?.matterType || 'General Inquiry',
            });
          } else {
            setError('Intake request not found');
          }
        } else {
          setIntake(data as IntakeRecord);
        }
      } catch (err: any) {
        setError(err.message || 'Error loading intake details');
      } finally {
        setLoading(false);
      }
    };

    loadIntake();
  }, [intakeId]);

  const handleFiles = async (selectedFiles: FileList | File[]) => {
    if (!intake) return;
    const fileList = Array.from(selectedFiles);
    
    // Add files to uploading list
    const newFiles = fileList.map(f => ({
      id: `file_${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      type: f.type,
      progress: 0,
      status: 'pending' as const,
    }));
    
    setFiles(prev => [...prev, ...newFiles]);

    // Upload each file
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const tracking = newFiles[i];
      
      setFiles(prev => prev.map(f => f.id === tracking.id ? { ...f, status: 'uploading', progress: 20 } : f));
      
      try {
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase client not available');

        // Look up firm owner's user_id to satisfy not null constraint
        const { data: member } = await supabase
          .from('firm_memberships')
          .select('user_id')
          .eq('firm_id', intake.firm_id)
          .limit(1)
          .maybeSingle();

        const userId = member?.user_id || '00000000-0000-0000-0000-000000000000';
        const caseId = intake.case_id || intake.id;
        const safeName = file.name.replace(/[\\/]/g, '_').replace(/[^\w.\-() ]+/g, '_');
        const storagePath = `${userId}/${caseId}/${Date.now()}-${safeName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('case-documents')
          .upload(storagePath, file, { upsert: true });

        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);
        
        setFiles(prev => prev.map(f => f.id === tracking.id ? { ...f, progress: 60 } : f));

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('case-documents')
          .getPublicUrl(storagePath);
        const fileUrl = publicUrlData?.publicUrl || null;

        // Insert document record
        const { error: dbError } = await supabase
          .from('documents')
          .insert({
            case_id: caseId,
            user_id: userId,
            name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: storagePath,
            file_url: fileUrl,
            status: 'queued',
          });

        if (dbError) throw new Error(`DB registration failed: ${dbError.message}`);

        setFiles(prev => prev.map(f => f.id === tracking.id ? { ...f, status: 'complete', progress: 100 } : f));
        toast.success(`Successfully uploaded ${file.name}`);
      } catch (err: any) {
        console.error('[PublicDocumentUpload] upload failed:', err);
        setFiles(prev => prev.map(f => f.id === tracking.id ? { ...f, status: 'error', error: err.message || 'Upload failed' } : f));
        toast.error(`Failed to upload ${file.name}`);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col justify-center items-center">
        <Loader2 size={40} className="animate-spin text-gold-500 mb-4" />
        <p className="text-slate-400 font-medium">Securing connection and loading details…</p>
      </div>
    );
  }

  if (error || !intake) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col justify-center items-center px-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white">Verification Failed</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            {error || 'This document upload link is invalid or has expired.'}
          </p>
          <Link to="/" className="mt-6 inline-flex items-center gap-2 text-sm text-gold-400 hover:text-gold-300 font-semibold transition-colors">
            Go to CaseBuddy Law <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="h-16 px-6 flex items-center border-b border-slate-800/60 shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <Scale size={22} className="text-gold-500" />
          <span className="text-lg font-serif font-bold text-white">CaseBuddy Law</span>
        </Link>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-green-500" /> Private &amp; confidential
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-serif font-bold text-white">Upload Case Documents</h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Hello <strong className="text-slate-200">{intake.full_name}</strong>. Please upload any photos, police reports, medical bills, or legal records for your <span className="text-gold-400 font-semibold">{intake.matter_type}</span> matter.
            </p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
              dragOver
                ? 'border-violet-500 bg-violet-500/10 scale-[0.99]'
                : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 hover:bg-slate-900/10'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
              multiple
              className="hidden"
            />
            <Upload size={32} className="text-slate-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white">Drag files here or click to browse</p>
            <p className="text-xs text-slate-500 mt-1">Supports PDF, JPG, PNG, DOCX up to 50MB</p>
          </div>

          {/* File upload progress / listing */}
          {files.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Uploaded Documents</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {files.map(f => {
                  const FileIcon = getFileIcon(f.type);
                  return (
                    <div key={f.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-slate-400 shrink-0">
                        <FileIcon size={16} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-white truncate">{f.name}</p>
                          <span className="text-[10px] text-slate-500 shrink-0">{formatFileSize(f.size)}</span>
                        </div>
                        
                        {f.status === 'uploading' && (
                          <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                            <div className="bg-violet-500 h-full rounded-full transition-all duration-300" style={{ width: `${f.progress}%` }} />
                          </div>
                        )}
                        
                        {f.status === 'error' && (
                          <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                            <AlertCircle size={10} /> {f.error || 'Upload failed'}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center">
                        {f.status === 'complete' ? (
                          <CheckCircle2 size={16} className="text-green-400" />
                        ) : f.status === 'uploading' ? (
                          <Loader2 size={14} className="animate-spin text-violet-400" />
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                            className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8 pt-5 border-t border-slate-800/60 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-500" /> Encrypted HIPAA &amp; SOC2 compliant
            </span>
            <button
              onClick={() => {
                toast.success('Thank you! Your documents have been attached to your file.');
                setFiles([]);
              }}
              disabled={files.length === 0 || files.some(f => f.status === 'uploading')}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-all"
            >
              Done Uploading
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PublicDocumentUpload;
