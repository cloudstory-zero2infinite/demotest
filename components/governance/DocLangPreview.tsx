import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import { supabase } from '../../services/supabase';
import { processMarkdownLinks } from './PoliciesView';

interface DocLangPreviewProps {
    docLang: any;
    orgName: string;
    logoUrl?: string | null;
    signatureUrl?: string | null;
    includeSignature?: boolean;
    allPolicies?: any[];
}

export const DocLangPreview: React.FC<DocLangPreviewProps> = ({ docLang, orgName, logoUrl, signatureUrl, includeSignature = true, allPolicies = [] }) => {
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!docLang?.images || !Array.isArray(docLang.images) || docLang.images.length === 0) {
            return;
        }

        const fetchUrls = async () => {
            const urlsMap: Record<string, string> = {};
            for (const img of docLang.images) {
                if (img.file_path) {
                    try {
                        const { data, error } = await supabase.storage
                            .from('policy-images')
                            .createSignedUrl(img.file_path, 3600);
                        if (!error && data?.signedUrl) {
                            urlsMap[img.name] = data.signedUrl;
                            const nameWithoutExt = img.name.replace(/\.[^/.]+$/, "");
                            urlsMap[nameWithoutExt] = data.signedUrl;
                        }
                    } catch (err) {
                        console.error('Error generating signed URL:', err);
                    }
                }
            }
            setSignedUrls(urlsMap);
        };

        fetchUrls();
    }, [docLang]);

    if (!docLang) {
        return <div className="p-4 text-gray-500">No document content to preview.</div>;
    }

    const formatList = (list: any[], bulletPoints: boolean = false): string => {
        if (!list || !Array.isArray(list)) return '';
        return list.map(item => {
            if (!item) return '';
            let val = '';
            if (typeof item === 'string') {
                val = item;
            } else if (typeof item === 'object') {
                if (item.text) val = item.text;
                else if (item.standard && item.clause) val = `${item.standard} — ${item.clause}`;
                else if (item.standard) val = item.standard;
                else if (item.name && item.description) val = `${item.name}: ${item.description}`;
                else if (item.name) val = item.name;
                else if (item.value) val = item.value;
                else if (item.role && item.scope) val = `${item.role} (${item.scope})`;
                else if (item.role) val = item.role;
                else {
                    const vals = Object.values(item).filter(v => typeof v === 'string' || typeof v === 'number');
                    val = vals.length > 0 ? vals.join(' — ') : JSON.stringify(item);
                }
            } else {
                val = String(item);
            }
            return bulletPoints ? `- ${val}` : val;
        }).join('\n');
    };

    const renderMarkdown = (md: string) => {
        if (!md) return '';
        try {
            let processed = md;

            // 1. Replace [Image: Name] with HTML Image referencing signed URL
            const imageRegex = /\[Image:\s*(.+?)\]/g;
            processed = processed.replace(imageRegex, (match, name) => {
                const signedUrl = signedUrls[name.trim()];
                if (signedUrl) {
                    return `<img src="${signedUrl}" alt="${name}" class="my-4 max-h-[400px] w-auto rounded border border-gray-200 dark:border-gray-800 shadow-sm" />`;
                }
                return `<div class="p-2 border border-dashed border-gray-300 dark:border-gray-700 text-xs text-gray-400 rounded my-2">Image "${name}" loading or private</div>`;
            });

            // 2. Replace standard markdown image tags ![Alt](images/filename.png) with signed URL matching filename
            const markdownImageRegex = /!\[(.*?)\]\((.*?)\)/g;
            processed = processed.replace(markdownImageRegex, (match, alt, url) => {
                const filename = url.split('/').pop() || '';
                const signedUrl = signedUrls[filename.trim()];
                if (signedUrl) {
                    return `<img src="${signedUrl}" alt="${alt || filename}" class="my-4 max-h-[400px] w-auto rounded border border-gray-200 dark:border-gray-800 shadow-sm" />`;
                }
                return match;
            });

            const processedLinks = processMarkdownLinks(processed, allPolicies, false);
            return marked.parse(processedLinks);
        } catch {
            const processedLinks = processMarkdownLinks(md, allPolicies, false);
            return marked.parse(processedLinks);
        }
    };

    const today = new Date().toLocaleDateString();

    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xl max-w-[850px] w-full mx-auto p-8 sm:p-12 text-gray-800 dark:text-gray-200 font-sans leading-relaxed text-sm">
            {/* Header Layout */}
            <div className="flex justify-between items-center border-b pb-6 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-blue-900 dark:text-blue-400">{docLang.title || 'Untitled Policy'}</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <strong>Document ID:</strong> {docLang.document_id || 'N/A'} | <strong>Version:</strong> {docLang.version || '1.0'} | <strong>Status:</strong> {docLang.status || 'Draft'}
                    </p>
                </div>
                {logoUrl && (
                    <img src={logoUrl} alt="Logo" className="max-h-12 max-w-[150px] object-contain" />
                )}
            </div>

            {/* Metadata Table */}
            <div className="mb-6 overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-800 text-xs">
                    <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800">
                            <th className="border border-gray-200 dark:border-gray-850 px-3 py-2 text-left font-semibold">Metadata Field</th>
                            <th className="border border-gray-200 dark:border-gray-850 px-3 py-2 text-left font-semibold">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border border-gray-200 dark:border-gray-850 px-3 py-2 font-medium">Organization</td>
                            <td className="border border-gray-200 dark:border-gray-850 px-3 py-2">{orgName}</td>
                        </tr>
                        {docLang.metadata?.owner_name && (
                            <tr>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2 font-medium">Owner</td>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2">{docLang.metadata.owner_name}</td>
                            </tr>
                        )}
                        {docLang.metadata?.refresh_date && (
                            <tr>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2 font-medium">Next Review Date</td>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2">{docLang.metadata.refresh_date}</td>
                            </tr>
                        )}
                        {docLang.document_type && (
                            <tr>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2 font-medium">Document Type</td>
                                <td className="border border-gray-200 dark:border-gray-850 px-3 py-2 capitalize">{docLang.document_type}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Standard References / Applicability */}
            {(docLang.references?.length > 0 || docLang.applicability?.length > 0) && (
                <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg space-y-3 border dark:border-gray-800 text-xs">
                    {docLang.references?.length > 0 && (
                        <div>
                            <span className="font-bold text-gray-700 dark:text-gray-300">Standard References:</span>
                            <div className="mt-1 pl-4" dangerouslySetInnerHTML={{ __html: renderMarkdown(formatList(docLang.references, true)) }} />
                        </div>
                    )}
                    {docLang.applicability?.length > 0 && (
                        <div>
                            <span className="font-bold text-gray-700 dark:text-gray-300">Applicability:</span>
                            <p className="mt-1 text-gray-650 dark:text-gray-400">{formatList(docLang.applicability).split('\n').join(', ')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Document Sections */}
            <div className="space-y-8">
                {docLang.sections && Array.isArray(docLang.sections) && docLang.sections.map((section: any) => (
                    <div key={section.id} className="policy-section">
                        <h2 className="text-base font-bold text-blue-800 dark:text-blue-400 mb-2 pb-1 border-b dark:border-gray-800">{section.title}</h2>
                        <div 
                            className="policy-prose text-gray-700 dark:text-gray-300 leading-relaxed space-y-2"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(section.content) }}
                        />
                    </div>
                ))}
            </div>

            {/* Signatures block */}
            {includeSignature !== false && (
                <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800 flex justify-between items-end">
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Signed on behalf of <strong>{orgName}</strong></p>
                        <p className="text-xs text-gray-400 mt-1">Date: {today}</p>
                    </div>
                    {signatureUrl ? (
                        <div className="text-right">
                            <img src={signatureUrl} alt="Signature" className="max-h-12 max-w-[150px] object-contain mb-1" />
                            <div className="w-32 border-t border-gray-300 dark:border-gray-750 inline-block"></div>
                            <p className="text-[10px] text-gray-400">Authorized Signature</p>
                        </div>
                    ) : (
                        <div className="text-right">
                            <div className="w-32 border-b border-dashed border-gray-300 dark:border-gray-700 mb-1"></div>
                            <p className="text-[10px] text-gray-450">Authorized Signature</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
