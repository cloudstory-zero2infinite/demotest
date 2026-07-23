import React, { useState, useEffect, useRef } from 'react';
import { BotIcon, PlusIcon, TrashIcon, PhotoIcon, LockIcon, UnlockIcon } from '../Icons';
import * as SupabaseService from '../../services/supabase';
import JSZip from 'jszip';

const AI_AGENT_URL = ((import.meta as any).env.VITE_AI_AGENT_URL as string) || '';

interface Section {
    id: string;
    title: string;
    content: string;
    locked?: boolean;
}

interface DocLangModel {
    document_type: string;
    document_id: string;
    title: string;
    version: string;
    status: string;
    metadata: {
        owner_name: string;
        refresh_date: string | null;
    };
    sections: Section[];
    approval_matrix: any[];
    revision_history: any[];
    references: any[];
    applicability: any[];
    tables: any[];
    images: any[];
    signatures: any[];
    attachments: any[];
}

const syncMetadataFromContent = (dl: any) => {
    if (!dl || !dl.sections) return dl;
    let owner = dl.metadata?.owner_name || '';
    let docId = dl.document_id || '';
    let version = dl.version || '';

    // Loop through all sections to look for metadata lines
    for (const sec of dl.sections) {
        if (!sec.content) continue;
        const lines = sec.content.split('\n');
        for (const line of lines) {
            // Match Owner: **Owner:** Name or Owner: Name or **Owner:** Name (CISO)
            const ownerMatch = line.match(/(?:\*\*Owner:\*\*|Owner:)\s*(.+)/i);
            if (ownerMatch) {
                const matchedOwner = ownerMatch[1].replace(/\*\*/g, '').trim();
                if (matchedOwner && matchedOwner.toLowerCase() !== '[author name]') {
                    owner = matchedOwner;
                }
            }
            // Match Document ID
            const docIdMatch = line.match(/(?:\*\*Document\s*ID:\*\*|Document\s*ID:)\s*(.+)/i);
            if (docIdMatch) {
                docId = docIdMatch[1].replace(/\*\*/g, '').trim();
            }
            // Match Version
            const versionMatch = line.match(/(?:\*\*Version:\*\*|Version:)\s*(.+)/i);
            if (versionMatch) {
                version = versionMatch[1].replace(/\*\*/g, '').trim();
            }
        }
    }

    return {
        ...dl,
        document_id: docId,
        version: version,
        metadata: {
            ...dl.metadata,
            owner_name: owner
        }
    };
};

export const parseDocumentText = (text: string, currentDocLang: any) => {
    if (!text.trim()) return null;
    const lines = text.split(/\r?\n/);
    const parsedSections: Section[] = [];
    let currentSection: { id: string; title: string; lines: string[] } | null = null;
    let documentTitle = currentDocLang.title || 'Imported Policy';
    let docId = currentDocLang.document_id || 'POL-TEMP';
    let owner = currentDocLang.metadata?.owner_name || '';
    let version = currentDocLang.version || '1.0';

    for (const line of lines) {
        const cleanLine = line.replace(/\s+/g, ' ').trim();
        
        const docIdMatch = cleanLine.match(/(?:Document\s*ID|Doc\s*ID|Policy\s*ID)[:\s*|]*\s*([A-Za-z0-9-]+)/i);
        if (docIdMatch) {
            docId = docIdMatch[1].trim();
        }
        
        const versionMatch = cleanLine.match(/Version[:\s*|]*\s*([Vv0-9.]+)/i);
        if (versionMatch) {
            version = versionMatch[1].trim();
        }

        const ownerMatch = cleanLine.match(/Owner[:\s*|]*\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z\s()]+)/i);
        if (ownerMatch) {
            const candidateOwner = ownerMatch[1].replace(/(?:Document\s*Type|Integrity|Version).*/i, '').trim();
            if (candidateOwner && candidateOwner !== 'Owner' && candidateOwner.toLowerCase() !== '[author name]') {
                owner = candidateOwner;
            }
        }

        const titleMatch = cleanLine.match(/Title(?:Internal)?[:\s*|]*\s*(.+)/i);
        if (titleMatch) {
            let candidateTitle = titleMatch[1].trim();
            if (candidateTitle.toLowerCase().startsWith('internal')) {
                documentTitle = candidateTitle;
            } else if (candidateTitle) {
                documentTitle = candidateTitle;
            }
        }

        // --- Robust Header Detection ---
        let isHeader = false;
        let matchedTitle = '';
        let isMainTitle = false;

        const standardHeaderMatch = line.match(/^(?:#{1,6})\s+(.+)$/);
        if (standardHeaderMatch) {
            isHeader = true;
            matchedTitle = standardHeaderMatch[1].trim();
            if (line.startsWith('# ')) {
                isMainTitle = true;
            }
        } else {
            const stripped = line.trim();
            const boldMatch = stripped.match(/^\*\*(.+?)\*\*$/);
            if (boldMatch) {
                const inner = boldMatch[1].trim();
                const numberedBold = inner.match(/^(\d+(?:\.\d+)*)[\s._.-]+([A-Z].*)$/);
                const isShortTitleHeader = inner.length < 60 && !/[:.,;]$/.test(inner) && /^[A-Z]/.test(inner);
                
                if (numberedBold || isShortTitleHeader) {
                    isHeader = true;
                    matchedTitle = inner;
                }
            } else {
                const numberedMatch = stripped.match(/^(\d+(?:\.\d+)*)[\s._.-]+([A-Z].*)$/);
                if (numberedMatch) {
                    isHeader = true;
                    matchedTitle = stripped;
                }
            }
        }

        if (isHeader) {
            if (currentSection) {
                parsedSections.push({
                    id: currentSection.id,
                    title: currentSection.title,
                    content: currentSection.lines.join('\n').trim()
                });
            } else if (isMainTitle) {
                documentTitle = matchedTitle;
            }

            const rawId = matchedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            currentSection = {
                id: rawId.startsWith('_') ? `sec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : rawId,
                title: matchedTitle,
                lines: []
            };
        } else {
            if (currentSection) {
                currentSection.lines.push(line);
            } else if (line.trim()) {
                const introId = 'introduction';
                currentSection = {
                    id: introId,
                    title: '1. Introduction',
                    lines: [line]
                };
            }
        }
    }

    if (currentSection) {
        parsedSections.push({
            id: currentSection.id,
            title: currentSection.title,
            content: currentSection.lines.join('\n').trim()
        });
    }

    if (parsedSections.length > 0) {
        return {
            ...currentDocLang,
            title: documentTitle,
            document_id: docId,
            version: version,
            metadata: {
                ...currentDocLang.metadata,
                owner_name: owner || currentDocLang.metadata?.owner_name || ''
            },
            sections: parsedSections
        };
    }
    return null;
};

interface PolicyEditorProps {
    docLang: DocLangModel;
    onChange: (updated: DocLangModel) => void;
    orgId: string;
    isReadOnly?: boolean;
}

export const PolicyEditor: React.FC<PolicyEditorProps> = ({ docLang, onChange, orgId, isReadOnly = false }) => {
    const [selectedSectionId, setSelectedSectionId] = useState<string>('');
    const [aiPrompt, setAiPrompt] = useState<string>('');
    const [aiRunning, setAiRunning] = useState<boolean>(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [pasteText, setPasteText] = useState<string>('');

    const handleDragEnter = (targetIndex: number) => {
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        const newSections = [...docLang.sections];
        const [draggedItem] = newSections.splice(draggedIndex, 1);
        newSections.splice(targetIndex, 0, draggedItem);
        setDraggedIndex(targetIndex);
        onChange(syncMetadataFromContent({ ...docLang, sections: newSections }));
    };

    const [uploading, setUploading] = useState(false);
    const [parsingFile, setParsingFile] = useState(false);
    const [uploadingImages, setUploadingImages] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const docImportInputRef = useRef<HTMLInputElement>(null);
    const imageUploadInputRef = useRef<HTMLInputElement>(null);

    const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setParsingFile(true);
        try {
            const extractedText = await SupabaseService.parsePolicyDocumentFile(file);
            const parsed = parseDocumentText(extractedText, docLang);
            if (parsed) {
                onChange(parsed);
                if (parsed.sections?.[0]) {
                    setSelectedSectionId(parsed.sections[0].id);
                }
            }
        } catch (err: any) {
            alert(err.message || 'Failed to parse file.');
        } finally {
            setParsingFile(false);
            if (docImportInputRef.current) {
                docImportInputRef.current.value = '';
            }
        }
    };

    const handleParsePasteText = () => {
        if (!pasteText.trim()) return;
        const parsed = parseDocumentText(pasteText, docLang);
        if (parsed) {
            onChange(parsed);
            if (parsed.sections?.[0]) {
                setSelectedSectionId(parsed.sections[0].id);
            }
        }
        setPasteText('');
    };

    const uploadImageToSupabase = async (file: File): Promise<{ name: string; filePath: string }> => {
        const fileName = `${Date.now()}-${file.name}`;
        try {
            const { data, error } = await SupabaseService.supabase.storage
                .from('policy-images')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type
                });
            
            if (error) {
                console.error('Supabase upload error:', error);
                throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
            }
            
            return { name: file.name, filePath: fileName };
        } catch (err: any) {
            console.error('Upload error details:', err);
            throw new Error(`Image upload failed: ${err.message || 'Unknown error'}`);
        }
    };

    const handleImageUpload = async (files: FileList) => {
        if (!selectedSectionId) return;
        const activeSec = docLang.sections?.find(s => s.id === selectedSectionId);
        if (!activeSec || activeSec.locked) return;
        
        setUploading(true);
        try {
            const imageFiles: File[] = [];
            const zipFile = Array.from(files).find(file => file.name.toLowerCase().endsWith('.zip'));
            
            let uploadedImages: { name: string; filePath: string }[] = [];
            if (zipFile) {
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(zipFile);
                const imagePromises: Promise<{ name: string; filePath: string }>[] = [];
                
                for (const [filename, file] of Object.entries(zipContent.files)) {
                    if (!file.dir && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename)) {
                        const blob = await file.async('blob');
                        let mimeType = blob.type;
                        if (!mimeType || mimeType === 'application/octet-stream') {
                            const ext = filename.toLowerCase().split('.').pop();
                            const mimeMap: Record<string, string> = {
                                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                                'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'
                            };
                            mimeType = mimeMap[ext || ''] || 'image/jpeg';
                        }
                        
                        const imageFile = new File([blob], filename, { type: mimeType });
                        imageFiles.push(imageFile);
                        imagePromises.push(uploadImageToSupabase(imageFile));
                    }
                }
                
                if (imageFiles.length === 0) {
                    throw new Error('No valid image files found in ZIP archive');
                }
                
                uploadedImages = await Promise.all(imagePromises);
            } else {
                const singleImageFiles = Array.from(files).filter(file => 
                    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)
                );
                
                if (singleImageFiles.length > 0) {
                    for (const file of singleImageFiles) {
                        const uploadResult = await uploadImageToSupabase(file);
                        uploadedImages.push(uploadResult);
                    }
                }
            }

            if (uploadedImages.length > 0) {
                const newDocImages = [...(docLang.images || [])];
                let updatedContent = activeSec.content || '';
                
                uploadedImages.forEach(({ name, filePath }) => {
                    newDocImages.push({
                        section_id: selectedSectionId,
                        name,
                        file_path: filePath
                    });
                    updatedContent += `\n\n[Image: ${name}]`;
                });

                const updatedSections = docLang.sections.map(s => 
                    s.id === selectedSectionId ? { ...s, content: updatedContent } : s
                );

                onChange({
                    ...docLang,
                    sections: updatedSections,
                    images: newDocImages
                });
            }
        } catch (err: any) {
            alert('Image upload failed: ' + err.message);
        } finally {
            setUploading(false);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            handleImageUpload(files);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleBulkImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploadingImages(true);
        try {
            const imageFiles: File[] = [];
            const zipFile = Array.from(files).find(file => file.name.toLowerCase().endsWith('.zip'));
            
            let uploadedImages: { name: string; filePath: string }[] = [];
            if (zipFile) {
                const zip = new JSZip();
                const zipContent = await zip.loadAsync(zipFile);
                const imagePromises: Promise<{ name: string; filePath: string }>[] = [];
                
                for (const [filename, file] of Object.entries(zipContent.files)) {
                    if (!file.dir && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename)) {
                        const blob = await file.async('blob');
                        let mimeType = blob.type;
                        if (!mimeType || mimeType === 'application/octet-stream') {
                            const ext = filename.toLowerCase().split('.').pop();
                            const mimeMap: Record<string, string> = {
                                'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                                'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml'
                            };
                            mimeType = mimeMap[ext || ''] || 'image/jpeg';
                        }
                        
                        const imageFile = new File([blob], filename, { type: mimeType });
                        imageFiles.push(imageFile);
                        imagePromises.push(uploadImageToSupabase(imageFile));
                    }
                }
                
                if (imageFiles.length === 0) {
                    throw new Error('No valid image files found in ZIP archive');
                }
                
                uploadedImages = await Promise.all(imagePromises);
            } else {
                const singleImageFiles = Array.from(files).filter(file => 
                    /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name)
                );
                
                if (singleImageFiles.length > 0) {
                    for (const file of singleImageFiles) {
                        const uploadResult = await uploadImageToSupabase(file);
                        uploadedImages.push(uploadResult);
                    }
                }
            }

            if (uploadedImages.length > 0) {
                const newDocImages = [...(docLang.images || [])];
                
                if (!selectedSectionId) {
                    // Paste Entire Document mode
                    let updatedPasteText = pasteText;
                    uploadedImages.forEach(({ name }) => {
                        if (!updatedPasteText.includes(`[Image: ${name}]`)) {
                            updatedPasteText += `\n\n[Image: ${name}]`;
                        }
                    });
                    setPasteText(updatedPasteText);

                    uploadedImages.forEach(({ name, filePath }) => {
                        newDocImages.push({
                            section_id: 'introduction',
                            name,
                            file_path: filePath
                        });
                    });

                    const parsed = parseDocumentText(updatedPasteText, {
                        ...docLang,
                        images: newDocImages
                    });

                    if (parsed) {
                        onChange(parsed);
                    } else {
                        onChange({
                            ...docLang,
                            images: newDocImages
                        });
                    }
                } else {
                    // Normal section-level mode
                    const sectionUpdates: Record<string, string[]> = {};
                    
                    uploadedImages.forEach(({ name, filePath }) => {
                        // Try to auto-detect section based on filename referenced in section contents
                        let targetSectionId = selectedSectionId || (docLang.sections?.[0]?.id || 'introduction');
                        if (docLang.sections) {
                            for (const sec of docLang.sections) {
                                if (sec.content && (sec.content.includes(name) || sec.content.toLowerCase().includes(name.toLowerCase()))) {
                                    targetSectionId = sec.id;
                                    break;
                                }
                            }
                        }
                        
                        newDocImages.push({
                            section_id: targetSectionId,
                            name,
                            file_path: filePath
                        });

                        if (!sectionUpdates[targetSectionId]) {
                            sectionUpdates[targetSectionId] = [];
                        }
                        sectionUpdates[targetSectionId].push(name);
                    });

                    const updatedSections = docLang.sections.map(s => {
                        const imagesToAppend = sectionUpdates[s.id];
                        if (imagesToAppend && imagesToAppend.length > 0) {
                            let content = s.content || '';
                            imagesToAppend.forEach(name => {
                                if (!content.includes(`[Image: ${name}]`)) {
                                    content += `\n\n[Image: ${name}]`;
                                }
                            });
                            return { ...s, content };
                        }
                        return s;
                    });

                    onChange({
                        ...docLang,
                        sections: updatedSections,
                        images: newDocImages
                    });
                }
                alert(`Successfully uploaded ${uploadedImages.length} image(s).`);
            }
        } catch (err: any) {
            alert('Image upload failed: ' + err.message);
        } finally {
            setUploadingImages(false);
            if (imageUploadInputRef.current) {
                imageUploadInputRef.current.value = '';
            }
        }
    };

    useEffect(() => {
        if (docLang?.sections?.length > 0 && !selectedSectionId) {
            setSelectedSectionId(docLang.sections[0].id);
        }
        validateDocument();
    }, [docLang]);

    const validateDocument = () => {
        const errors: string[] = [];
        if (!docLang.title?.trim()) errors.push("Document Title is required.");
        if (!docLang.document_id?.trim()) errors.push("Document ID is required.");
        if (!docLang.metadata?.owner_name?.trim()) errors.push("Owner Name is required.");
        
        // Required sections check
        const required: string[] = [];
        required.forEach(req => {
            const hasSec = docLang.sections?.find(s => s.id.toLowerCase() === req || s.title.toLowerCase().includes(req));
            if (!hasSec) {
                errors.push(`Missing required section: "${req.charAt(0).toUpperCase() + req.slice(1)}"`);
            } else if (!hasSec.content?.trim()) {
                errors.push(`Required section "${hasSec.title}" is empty.`);
            }
        });

        docLang.sections?.forEach(s => {
            if (!s.title?.trim()) errors.push("Section title cannot be empty.");
        });

        setValidationErrors(errors);
    };

    const updateMetadata = (key: string, value: any) => {
        const updated = { ...docLang };
        if (key === 'owner_name' || key === 'refresh_date') {
            updated.metadata = { ...updated.metadata, [key]: value };
        } else {
            (updated as any)[key] = value;
        }
        onChange(updated);
    };

    const handleSectionChange = (id: string, field: 'title' | 'content' | 'locked', value: any) => {
        const updatedSections = docLang.sections.map(s => {
            if (s.id === id) {
                return { ...s, [field]: value };
            }
            return s;
        });
        onChange(syncMetadataFromContent({ ...docLang, sections: updatedSections }));
    };

    const addSection = () => {
        const newId = `section_${Date.now()}`;
        const newSec: Section = {
            id: newId,
            title: 'New Section',
            content: 'Add content here...',
            locked: false
        };
        onChange(syncMetadataFromContent({
            ...docLang,
            sections: [...docLang.sections, newSec]
        }));
        setSelectedSectionId(newId);
    };

    const removeSection = (id: string) => {
        const remaining = docLang.sections.filter(s => s.id !== id);
        onChange(syncMetadataFromContent({ ...docLang, sections: remaining }));
        if (selectedSectionId === id && remaining.length > 0) {
            setSelectedSectionId(remaining[0].id);
        }
    };

    const moveSection = (index: number, direction: 'up' | 'down') => {
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= docLang.sections.length) return;
        const newSections = [...docLang.sections];
        const temp = newSections[index];
        newSections[index] = newSections[nextIndex];
        newSections[nextIndex] = temp;
        onChange(syncMetadataFromContent({ ...docLang, sections: newSections }));
    };

    const handleAISegmentEdit = async () => {
        if (!aiPrompt.trim()) return;
        setAiRunning(true);
        try {
            const resp = await fetch(`${AI_AGENT_URL}/policy/edit-section`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    org_id: orgId,
                    current_doclang: JSON.stringify(docLang),
                    target_node: `sections.${selectedSectionId}`,
                    instruction: aiPrompt
                })
            });

            if (!resp.ok || !resp.body) {
                throw new Error("Section edit request failed.");
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullResult = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buffer.indexOf('\n\n')) !== -1) {
                    const raw = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const line = raw.split('\n').find(l => l.startsWith('data: '));
                    if (!line) continue;
                    const payload = line.slice(6);
                    let evt: any;
                    try { evt = JSON.parse(payload); } catch { continue; }
                    if (evt.type === 'chunk') {
                        fullResult += (evt.text || '');
                    } else if (evt.type === 'error') {
                        throw new Error(evt.message || "AI Error");
                    }
                }
            }

            if (fullResult) {
                let cleanJson = fullResult.trim();
                
                // Extract only the JSON boundaries to ignore preambles/postambles
                const firstBrace = cleanJson.indexOf('{');
                const lastBrace = cleanJson.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
                } else {
                    if (cleanJson.startsWith('```json')) {
                        cleanJson = cleanJson.slice(7);
                    }
                    if (cleanJson.endsWith('```')) {
                        cleanJson = cleanJson.slice(0, -3);
                    }
                }
                
                const parsed = JSON.parse(cleanJson.trim());
                onChange(syncMetadataFromContent(parsed));
                setAiPrompt('');
            }
        } catch (err: any) {
            alert("AI Edit failed: " + err.message);
        } finally {
            setAiRunning(false);
        }
    };

    const selectedSection = docLang.sections?.find(s => s.id === selectedSectionId);

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 text-gray-800 dark:text-gray-200">
                {/* Sidebar section list & validations */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Meta details */}
                    <div className="bg-gray-50 dark:bg-gray-800/40 border dark:border-gray-800 rounded-xl p-4 space-y-3">
                        <h3 className="text-sm font-bold text-blue-900 dark:text-blue-400">Document Settings</h3>
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 mb-1">Document ID</label>
                             <input
                                type="text"
                                value={docLang.document_id}
                                onChange={e => updateMetadata('document_id', e.target.value)}
                                disabled={isReadOnly}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 mb-1">Title</label>
                            <input
                                type="text"
                                value={docLang.title}
                                onChange={e => updateMetadata('title', e.target.value)}
                                disabled={isReadOnly}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium text-gray-500 mb-1">Owner</label>
                            <input
                                type="text"
                                value={docLang.metadata?.owner_name || ''}
                                onChange={e => updateMetadata('owner_name', e.target.value)}
                                disabled={isReadOnly}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>

                    {/* Section List */}
                    <div className="bg-gray-50 dark:bg-gray-800/40 border dark:border-gray-800 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-400">Sections</h3>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={addSection}
                                    disabled={isReadOnly}
                                    className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs flex items-center gap-1 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <PlusIcon className="h-3 w-3" />
                                    Add
                                </button>
                            </div>
                        </div>
                        <div className="space-y-1 max-h-[480px] overflow-y-auto">
                            {docLang.sections?.map((s, idx) => (
                                <div 
                                    key={s.id} 
                                    draggable={!isReadOnly}
                                    onDragStart={(e) => {
                                        if (isReadOnly) return;
                                        setDraggedIndex(idx);
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragEnter={() => !isReadOnly && handleDragEnter(idx)}
                                    onDragEnd={() => setDraggedIndex(null)}
                                    style={{ opacity: draggedIndex === idx ? 0.4 : 1 }}
                                    className={`flex items-center justify-between p-2 rounded-md transition-colors ${selectedSectionId === s.id ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800/50'}`}
                                >
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <span 
                                            className={`text-gray-400 dark:text-gray-500 font-bold select-none text-sm pr-1 ${isReadOnly ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'}`}
                                            title={isReadOnly ? "" : "Drag to reorder"}
                                        >
                                            ⠿
                                        </span>
                                        <button
                                            onClick={() => setSelectedSectionId(s.id)}
                                            className="flex-1 text-left text-xs font-semibold truncate pr-2 dark:text-gray-200"
                                        >
                                            {s.title || 'Untitled Section'}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button 
                                            onClick={() => removeSection(s.id)}
                                            disabled={isReadOnly}
                                            className="text-red-400 hover:text-red-650 ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Delete"
                                        >
                                            <TrashIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Editor Content Area */}
                <div className="lg:col-span-8 space-y-6">
                    {validationErrors.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300 p-4 rounded-xl space-y-1">
                            <h4 className="text-xs font-bold">Please address the following validation errors:</h4>
                            <ul className="list-disc list-inside text-[11px] space-y-0.5 opacity-90">
                                {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        </div>
                    )}

                    {selectedSection ? (
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-800 rounded-xl p-6 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between border-b dark:border-gray-700 pb-3">
                                <input
                                    type="text"
                                    value={selectedSection.title}
                                    onChange={e => handleSectionChange(selectedSection.id, 'title', e.target.value)}
                                    disabled={selectedSection.locked || isReadOnly}
                                    className="text-base font-bold bg-transparent border-none p-0 focus:ring-0 w-full md:w-1/2 text-gray-900 dark:text-white"
                                />
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={e => e.target.files && handleImageUpload(e.target.files)}
                                        multiple
                                        accept="image/*,application/zip"
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={selectedSection.locked || uploading || isReadOnly}
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={uploading ? "Uploading..." : "Add Image"}
                                    >
                                        <PhotoIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleSectionChange(selectedSection.id, 'locked', !selectedSection.locked)}
                                        disabled={isReadOnly}
                                        className={`p-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                            selectedSection.locked 
                                                ? 'bg-red-50 text-red-650 dark:bg-red-950/30' 
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                                        }`}
                                        title={selectedSection.locked ? "Locked" : "Unlocked"}
                                    >
                                        {selectedSection.locked ? <LockIcon className="h-4 w-4" /> : <UnlockIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>

                            <textarea
                                value={selectedSection.content}
                                onChange={e => handleSectionChange(selectedSection.id, 'content', e.target.value)}
                                disabled={selectedSection.locked || isReadOnly}
                                rows={14}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                            />

                            {/* Section Attachments bar */}
                            {(selectedSection.locked && !isReadOnly) ? null : (() => {
                                const sectionImages = docLang.images?.filter(img => img.section_id === selectedSection.id || (img.file_path && img.file_path.startsWith(selectedSection.id + '/'))) || [];
                                if (sectionImages.length === 0) return null;
                                
                                return (
                                    <div className="border dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl p-4 space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {sectionImages.map(img => (
                                                <div key={img.file_path || img.filePath} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-gray-800 border dark:border-gray-850">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="text-[11px] text-gray-500 truncate max-w-[140px] font-mono">{img.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">                                                         <button 
                                                             onClick={() => {
                                                                 const tag = `[Image: ${img.name}]`;
                                                                 const activeSec = docLang.sections.find(s => s.id === selectedSectionId);
                                                                 if (!activeSec) return;
                                                                 const currentText = activeSec.content || '';
                                                                 const updated = currentText.includes(tag) ? currentText : (currentText + '\n\n' + tag);
                                                                 handleSectionChange(selectedSectionId, 'content', updated);
                                                             }}
                                                             disabled={isReadOnly}
                                                             className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                                             title="Insert Tag"
                                                         >
                                                             <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                             </svg>
                                                         </button>
                                                        <button
                                                            onClick={async () => {
                                                                const isConfirmed = confirm("Are you sure you want to delete this attachment?");
                                                                if (!isConfirmed) return;
                                                                const imgPath = img.file_path || img.filePath;
                                                                const updatedImages = docLang.images.filter(i => (i.file_path || i.filePath) !== imgPath);
                                                                const tag = `[Image: ${img.name}]`;
                                                                const cleanedContent = (selectedSection.content || '').replace(tag, '').trim();
                                                                const updatedSections = docLang.sections.map((s: any) => 
                                                                    s.id === selectedSectionId ? { ...s, content: cleanedContent } : s
                                                                 );
                                                                onChange({
                                                                    ...docLang,
                                                                    sections: updatedSections,
                                                                    images: updatedImages
                                                                });
                                                            }}
                                                            disabled={selectedSection.locked || isReadOnly}
                                                            className="text-red-500 hover:text-red-650 disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            <TrashIcon className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* AI native editing block */}
                            <div className="border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl p-4 flex flex-col md:flex-row gap-3 items-center">
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <BotIcon className="h-5 w-5 text-blue-600" />
                                    <span className="text-xs font-bold text-blue-900 dark:text-blue-300">AI Section</span>
                                </div>
                                <input
                                    type="text"
                                    placeholder={`Ask AI to edit this section (e.g. "Expand this section with details on cloud backup policies")`}
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    disabled={selectedSection.locked || aiRunning || isReadOnly}
                                    className="flex-1 text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <button
                                    onClick={handleAISegmentEdit}
                                    disabled={selectedSection.locked || aiRunning || !aiPrompt.trim() || isReadOnly}
                                    className="px-4 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                    {aiRunning ? 'Editing...' : 'Apply AI Edit'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-gray-800 border dark:border-gray-800 rounded-xl p-6 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 border-b dark:border-gray-700 pb-3">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <svg className="h-5 w-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Paste Entire Document</h3>
                                </div>
                            </div>
                            
                            <textarea
                                value={pasteText}
                                onChange={e => {
                                    const newVal = e.target.value;
                                    setPasteText(newVal);
                                    const parsed = parseDocumentText(newVal, docLang);
                                    if (parsed) {
                                        onChange(parsed);
                                    }
                                }}
                                placeholder="Paste your document text here..."
                                rows={16}
                                disabled={isReadOnly}
                                className="w-full text-xs rounded-md border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono p-3 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            
                            <div className="flex justify-between items-center pt-2">
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="file"
                                        ref={docImportInputRef}
                                        onChange={handleDocFileUpload}
                                        accept=".md,.pdf,.docx,.txt"
                                        className="hidden"
                                    />

                                    <input 
                                        type="file"
                                        multiple
                                        ref={imageUploadInputRef}
                                        onChange={handleBulkImageUpload}
                                        accept="image/*,.zip"
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        disabled={uploadingImages || isReadOnly}
                                        onClick={() => imageUploadInputRef.current?.click()}
                                        className="p-2 border border-gray-300 dark:border-gray-650 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                                        title={uploadingImages ? "Uploading..." : "Upload Images"}
                                    >
                                        {uploadingImages ? (
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                                        ) : (
                                            <PhotoIcon className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                                <button
                                    onClick={handleParsePasteText}
                                    disabled={!pasteText.trim() || isReadOnly}
                                    className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-md text-xs font-bold shadow-md hover:shadow-lg disabled:from-gray-400 disabled:to-gray-450 disabled:shadow-none disabled:cursor-not-allowed disabled:opacity-50 transition duration-150 ease-in-out"
                                >
                                    Extract
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};
