import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ProgramTask, ProgramTaskCreate, ProgramTaskUpdate, ActivityLog, InternalControl, InternalControlCreate, InternalControlUpdate, Asset, AssetCreate, AssetUpdate, PolicyDocument, PolicyDocumentCreate, PolicyDocumentUpdate, Compliance, ComplianceCreate, ComplianceUpdate, Contact, ContactCreate, ContactUpdate, AllActivityLog, Vulnerability, VulnerabilityCreate, VulnerabilityUpdate, PolicyNode, PolicyLink, WorkflowTemplate } from '../types';

// Updated to provided Supabase project
const supabaseUrl = 'https://aswhgudvanozkhefurbi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd2hndWR2YW5vemtoZWZ1cmJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTMyNjIsImV4cCI6MjA4NjgyOTI2Mn0.JBjEYH8p_UUDFyFtN66_dFFMfsgILqjTUzMAcmSh2wI';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const GRC_DOCUMENTS_BUCKET = 'grc-documents';

// --- Organization & User Functions ---

/**
 * Get the organization ID for the current logged-in user
 */
export const getUserOrgId = async (): Promise<string | null> => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = (sessionData?.session as any)?.user?.id ?? null;
        
        if (!userId) return null;
        
        const { data, error } = await supabase
            .from('org_onboarding')
            .select('org_id')
            .eq('user_id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching org_id:', error);
            return null;
        }
        
        return data?.org_id ?? null;
    } catch (error) {
        console.error('Error in getUserOrgId:', error);
        return null;
    }
};

/**
 * Get all users in the same organization as the current user
 */
export const getOrganizationUsers = async (orgId?: string): Promise<any[]> => {
    try {
        let targetOrgId = orgId;
        
        if (!targetOrgId) {
            targetOrgId = await getUserOrgId();
        }
        
        if (!targetOrgId) {
            console.warn('No organization found for user');
            return [];
        }
        
        const { data, error } = await supabase
            .from('org_onboarding')
            .select('*')
            .eq('org_id', targetOrgId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching organization users:', error);
        return [];
    }
};

/**
 * Get the current logged-in user's role from org_onboarding table
 */
export const getUserRole = async (): Promise<string | null> => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = (sessionData?.session as any)?.user?.id ?? null;
        
        if (!userId) return null;
        
        const { data, error } = await supabase
            .from('org_onboarding')
            .select('role')
            .eq('user_id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching user role:', error);
            return null;
        }
        
        return data?.role ?? null;
    } catch (error) {
        console.error('Error in getUserRole:', error);
        return null;
    }
};

/**
 * Create a new organization
 */
export const createOrganization = async (name: string): Promise<any> => {
    try {
        const { data, error } = await supabase
            .from('organizations')
            .insert({ name })
            .select()
            .single();
        
        if (error) {
            console.error('Error creating organization:', error);
            throw error;
        }
        return data;
    } catch (error) {
        console.error('Error in createOrganization:', error);
        throw error;
    }
};

/**
 * Look up user ID by email from auth.users
 */
export const getUserIdByEmail = async (email: string): Promise<string | null> => {
    try {
        const { data, error } = await supabase
            .rpc('get_user_id_by_email', { email_input: email });
        
        if (error) {
            console.warn('Could not find user by email:', email, error);
            return null;
        }
        
        console.log('Found user_id for', email, ':', data);
        return data;
    } catch (error) {
        console.error('Error in getUserIdByEmail:', error);
        return null;
    }
};

/**
 * Onboard a user to an organization
 */
export const onboardUserToOrganization = async (orgId: string, email: string, role: string = 'user', description?: string): Promise<any> => {
    try {
        // Look up user_id by email - optional, allows pending invitations
        const userId = await getUserIdByEmail(email);
        
        if (userId) {
            console.log(`User ${email} exists: user_id = ${userId}`);
        } else {
            console.log(`User ${email} has not signed up yet - creating pending invitation`);
        }
        
        const payload: any = { 
            org_id: orgId, 
            email: email.toLowerCase(), 
            role
        };
        
        // Only add user_id if found (otherwise it's a pending invitation)
        if (userId) {
            payload.user_id = userId;
        }
        
        // Add description if provided
        if (description && description.trim()) {
            payload.description = description;
        }
        
        const { data, error } = await supabase
            .from('org_onboarding')
            .insert(payload)
            .select()
            .single();
        
        if (error) {
            console.error('Error onboarding user:', error);
            throw error;
        }
        
        const status = userId ? 'active' : 'pending invitation';
        console.log(`User ${email} onboarded [${status}]:`, { userId: data.user_id, description: data.description });
        return data;
    } catch (error) {
        console.error('Error in onboardUserToOrganization:', error);
        throw error;
    }
};

// --- Program Milestone Functions ---

export const addActivityLog = async (programId: string, activity: string) => {
    const orgId = await getUserOrgId();
    if (!orgId) {
        console.error('No organization found for user');
        return;
    }
    const { error } = await supabase.from('program_activity_log').insert({ program_id: programId, activity, org_id: orgId });
    if (error) console.error('Error logging activity:', error);
};

export const getTasks = async (): Promise<ProgramTask[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('program').select('*').eq('org_id', orgId).order('last_updated', { ascending: false });
    if (error) throw error;
    return data || [];
};

export const addTask = async (task: ProgramTaskCreate): Promise<ProgramTask> => {
    // Ensure the inserted task carries the current user's id and org_id to satisfy RLS policies
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payload = { ...(task as any), user_id: userId, org_id: orgId };
    const { data, error } = await supabase.from('program').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const bulkAddTasks = async (tasks: ProgramTaskCreate[]): Promise<ProgramTask[]> => {
    // Attach current user id and org_id to each task for RLS checks
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payloads = tasks.map(t => ({ ...(t as any), user_id: userId, org_id: orgId }));
    const { data, error } = await supabase.from('program').insert(payloads).select();
    if (error) throw error;
    return data || [];
}

export const updateTask = async (id: string, updates: ProgramTaskUpdate): Promise<ProgramTask> => {
    const { data, error } = await supabase.from('program').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteTask = async (id: string): Promise<void> => {
    const { error } = await supabase.from('program').delete().eq('id', id);
    if (error) throw error;
};

export const getActivityLogs = async (programId: string): Promise<ActivityLog[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('program_activity_log').select('*').eq('program_id', programId).eq('org_id', orgId).order('created_at', { ascending: false }).limit(5);
    if (error) throw error;
    return data || [];
};

/**
 * Get all activity logs for the current user's organization (not limited to a specific program)
 */
export const getAllOrgActivityLogs = async (): Promise<ActivityLog[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('program_activity_log').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(100);
    if (error) {
        console.error('Error fetching org activity logs:', error);
        return [];
    }
    return data || [];
};


// --- Governance: File Handling ---
export const uploadFile = async (file: File, pathPrefix: string): Promise<string> => {
    const filePath = `${pathPrefix}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from(GRC_DOCUMENTS_BUCKET).upload(filePath, file);
    if (error) throw error;

    const { data } = supabase.storage.from(GRC_DOCUMENTS_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
};

export const getFileUrl = (filePath: string): string => {
    const { data } = supabase.storage.from(GRC_DOCUMENTS_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
}

// Get public URL for any bucket/path
export const getStoragePublicUrl = (bucket: string, filePath: string): string => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
}

// Create a signed URL for a storage object (expiresIn seconds)
export const createSignedUrl = async (bucket: string, filePath: string, expiresIn: number = 60) : Promise<string> => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
    if (error) throw error;
    return data.signedUrl;
}

// --- Governance: Internal Controls ---

export const getComplianceTags = async (): Promise<string[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('compliance').select('compliance_id').eq('org_id', orgId);
    if (error) {
        console.error("Could not fetch compliance tags, returning empty list.", error);
        return [];
    }
    return data.map(item => item.compliance_id) || [];
};

export const getInternalControls = async (): Promise<InternalControl[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('internal_control_catalogue').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

export const addInternalControl = async (control: InternalControlCreate): Promise<InternalControl> => {
    // Attach current authenticated user id and org_id for RLS ownership checks
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payload = { ...(control as any), user_id: userId, org_id: orgId };
    const { data, error } = await supabase.from('internal_control_catalogue').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const updateInternalControl = async (id: string, updates: InternalControlUpdate): Promise<InternalControl> => {
    const { data, error } = await supabase.from('internal_control_catalogue').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteInternalControl = async (id: string): Promise<void> => {
    const { error } = await supabase.from('internal_control_catalogue').delete().eq('id', id);
    if (error) throw error;
};

export const bulkAddInternalControls = async (controls: InternalControlCreate[]): Promise<InternalControl[]> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payloads = controls.map(c => ({ ...(c as any), user_id: userId, org_id: orgId }));
    const { data, error } = await supabase.from('internal_control_catalogue').insert(payloads).select();
    if (error) throw error;
    return data || [];
}

// --- Governance: Assets ---

export const getAssets = async (): Promise<Asset[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('assets').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

export const addAsset = async (asset: AssetCreate): Promise<Asset> => {
    // Attach current user's id and org_id to satisfy RLS policies that require ownership
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payload = { ...(asset as any), user_id: userId, org_id: orgId };
    const { data, error } = await supabase.from('assets').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const updateAsset = async (id: string, updates: AssetUpdate): Promise<Asset> => {
    const { data, error } = await supabase.from('assets').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteAsset = async (id: string): Promise<void> => {
    const { error } = await supabase.from('assets').delete().eq('id', id);
    if (error) throw error;
};

export const bulkAddAssets = async (assets: AssetCreate[]): Promise<Asset[]> => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payloads = assets.map(a => ({ ...(a as any), user_id: userId, org_id: orgId }));
    const { data, error } = await supabase.from('assets').insert(payloads).select();
    if (error) throw error;
    return data || [];
}

// --- Governance: Policies ---

export const getPolicies = async (): Promise<PolicyDocument[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('policy_documents').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

export const addPolicy = async (policy: PolicyDocumentCreate): Promise<PolicyDocument> => {
    // Attach current user id and org_id for RLS ownership enforcement
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payload = { ...(policy as any), user_id: userId, org_id: orgId };
    const { data, error } = await supabase.from('policy_documents').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const updatePolicy = async (id: string, updates: PolicyDocumentUpdate): Promise<PolicyDocument> => {
    const { data, error } = await supabase.from('policy_documents').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deletePolicy = async (id: string): Promise<void> => {
    const { data, error } = await supabase.from('policy_documents').delete().eq('id', id);
    if (error) throw error;
};

// --- Governance: Vulnerability Management ---
export const getVulnerabilities = async (): Promise<Vulnerability[]> => {
    // Step 0: Get organization ID
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    
    // Step 1: Fetch all assets for this organization and create a lookup map for efficient joining.
    const { data: assetsData, error: assetsError } = await supabase
        .from('assets')
        .select('id, asset_id, name')
        .eq('org_id', orgId);
    if (assetsError) throw assetsError;
    const assetMap = new Map(assetsData.map(asset => [asset.id, { asset_id: asset.asset_id, name: asset.name }]));

    // Step 2: Fetch all vulnerabilities for this organization without trying to join at the DB level.
    const { data: vulnerabilitiesData, error: vulnerabilitiesError } = await supabase
        .from('vulnerability_management')
        .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false });
    if (vulnerabilitiesError) throw vulnerabilitiesError;

    // Step 3: Manually "join" the data in the application layer.
    const enrichedVulnerabilities = vulnerabilitiesData.map(vuln => ({
        ...vuln,
        assets: vuln.asset_id ? assetMap.get(vuln.asset_id) || null : null
    }));

    return (enrichedVulnerabilities as Vulnerability[]) || [];
};

export const addVulnerability = async (vulnerability: VulnerabilityCreate): Promise<Vulnerability> => {
    // Insert the new vulnerability data with current user ownership and org_id for RLS
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = (sessionData?.session as any)?.user?.id ?? null;
    const orgId = await getUserOrgId();
    const payload = { ...(vulnerability as any), user_id: userId, org_id: orgId };
    const { data: insertedData, error: insertError } = await supabase.from('vulnerability_management')
        .insert(payload)
        .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
        .single();
    if (insertError) throw insertError;

    // If an asset is associated, fetch its details to return the complete object.
    if (insertedData.asset_id) {
        const { data: assetData, error: assetError } = await supabase
            .from('assets')
            .select('asset_id, name')
            .eq('id', insertedData.asset_id)
            .single();
        
        (insertedData as any).assets = assetError ? null : assetData;
    } else {
        (insertedData as any).assets = null;
    }

    return insertedData as Vulnerability;
};

export const updateVulnerability = async (id: string, updates: VulnerabilityUpdate): Promise<Vulnerability> => {
    // Update the vulnerability data.
    const { data: updatedData, error: updateError } = await supabase.from('vulnerability_management')
        .update(updates)
        .eq('vuln_id', id)
        .select('id:vuln_id, name, description, derived_from, status, created_at, updated_at, asset_id')
        .single();
    if (updateError) throw updateError;
    
    // If an asset is associated, fetch its details to return the complete object.
    if (updatedData.asset_id) {
        const { data: assetData, error: assetError } = await supabase
            .from('assets')
            .select('asset_id, name')
            .eq('id', updatedData.asset_id)
            .single();
        
        (updatedData as any).assets = assetError ? null : assetData;
    } else {
        (updatedData as any).assets = null;
    }
            
    return updatedData as Vulnerability;
};


export const deleteVulnerability = async (id: string): Promise<void> => {
    const { error } = await supabase.from('vulnerability_management').delete().eq('vuln_id', id);
    if (error) throw error;
};


// --- Compliance Functions ---
export const getCompliances = async (): Promise<Compliance[]> => {
    const { data, error } = await supabase.from('compliance').select('*');
    if (error) throw error;
    return (data || []).map((item: any) => ({
        ...item,
        compliance_id: item.compliance_id ?? item.id,
    }));
};

export const addCompliance = async (compliance: ComplianceCreate): Promise<Compliance> => {
    const orgId = await getUserOrgId();
    const payload = { ...(compliance as any), org_id: orgId };
    const { data, error } = await supabase.from('compliance').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const updateCompliance = async (id: string, updates: ComplianceUpdate): Promise<Compliance> => {
    const { data, error } = await supabase.from('compliance').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteCompliance = async (id: string): Promise<void> => {
    const { error } = await supabase.from('compliance').delete().eq('id', id);
    if (error) throw error;
};

// --- Organisation: Contacts ---
export const getContacts = async (): Promise<Contact[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    const { data, error } = await supabase.from('contacts').select('*').eq('org_id', orgId).order('level', { ascending: true });
    if (error) throw error;
    return data || [];
};

export const addContact = async (contact: ContactCreate): Promise<Contact> => {
    const orgId = await getUserOrgId();
    const payload = { ...(contact as any), org_id: orgId };
    const { data, error } = await supabase.from('contacts').insert(payload).select().single();
    if (error) throw error;
    return data;
};

export const updateContact = async (id: string, updates: ContactUpdate): Promise<Contact> => {
    const { data, error } = await supabase.from('contacts').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
};

export const deleteContact = async (id: string): Promise<void> => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) throw error;
};

export const bulkAddContacts = async (contacts: ContactCreate[]): Promise<Contact[]> => {
    const orgId = await getUserOrgId();
    const payloads = contacts.map(c => ({ ...(c as any), org_id: orgId }));
    const { data, error } = await supabase.from('contacts').insert(payloads).select();
    if (error) throw error;
    return data || [];
};

// --- All Activity Log Functions ---
export const logAllActivity = async (logData: {
    action: string;
    module: string;
    entity_id?: string;
    entity_name?: string;
    event_data?: Record<string, any>;
    severity?: 'info' | 'warning' | 'error';
}, userParam?: { id?: string; email?: string } | null): Promise<boolean> => {
    try {
        // prefer provided user (from caller) to avoid race conditions during auth callbacks
        let user: any = null;
        if (userParam) {
            user = userParam;
        } else {
            const { data: userData } = await supabase.auth.getUser();
            user = (userData as any)?.user ?? null;
        }

        // Get org_id for the user
        const orgId = await getUserOrgId();

        const insertPayload: any = {
            ...logData,
            user_id: user?.id ?? null,
            org_id: orgId,
            // attach user email into event_data to avoid relying on an extra DB column
            event_data: {
                ...(logData.event_data || {}),
                user_email: user?.email ?? null,
            },
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        };

        const { data, error } = await supabase.from('all_activity_log').insert(insertPayload).select();
        if (error) {
            console.error('Error logging global activity:', error);
            return false;
        }
        if (data && data.length > 0) {
            console.debug('Activity logged:', data[0]);
        } else {
            console.debug('Activity logged (no response data)');
        }
        return true;
    } catch (err) {
        console.error('Unexpected error while logging activity:', err);
        return false;
    }
};

export const getAllActivityLogs = async (): Promise<AllActivityLog[]> => {
    const orgId = await getUserOrgId();
    if (!orgId) return [];
    
    try {
        // Fetch all activity logs for the organization
        const { data: activityLogs, error: logsError } = await supabase
            .from('all_activity_log')
            .select('*')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(200);
        
        if (logsError) throw logsError;
        if (!activityLogs || activityLogs.length === 0) return [];

        // Fetch organization name
        const { data: orgData, error: orgError } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('id', orgId)
            .single();
        
        const orgName = orgError ? 'Unknown Org' : (orgData?.name || 'Unknown Org');

        // Fetch all org_onboarding data for this org to map user_id to roles
        const { data: orgOnboarding, error: onboardingError } = await supabase
            .from('org_onboarding')
            .select('user_id, role')
            .eq('org_id', orgId);
        
        const roleMap = new Map(
            (orgOnboarding || []).map(record => [record.user_id, record.role])
        );

        // Enrich activity logs with org name and user role
        const enrichedLogs = activityLogs.map(log => ({
            ...log,
            org_name: orgName,
            user_role: roleMap.get(log.user_id) || 'Unknown',
        }));

        return enrichedLogs as AllActivityLog[];
    } catch (error) {
        console.error('Error fetching activity logs with org details:', error);
        return [];
    }
};

// Insert into per-user activity_logs table. Uses currently authenticated user id.
export const addUserActivityLog = async (payload: { action: string; details?: Record<string, any> } ) : Promise<{ data: any | null; error: any | null }> => {
    try {
        const { data: sessionData } = await supabase.auth.getSession();
        const user = sessionData?.session?.user ?? null;
        const insertPayload: any = {
            action: payload.action,
            details: payload.details || {},
            user_id: user?.id ?? null,
        };
        const { data, error } = await supabase.from('activity_logs').insert(insertPayload).select();
        if (error) {
            console.error('addUserActivityLog error:', error);
            return { data: null, error };
        }
        return { data, error: null };
    } catch (err) {
        console.error('Unexpected error in addUserActivityLog:', err);
        return { data: null, error: err };
    }
};

// --- Policy Manager Functions (Mock/Persistent Storage Logic) ---

export const getPolicyNodes = async (): Promise<PolicyNode[]> => {
    // In a real app, this would be a table `policy_nodes`
    // Using local storage for demo persistence if table not available
    const stored = localStorage.getItem('grc_policy_nodes');
    if (stored) return JSON.parse(stored);
    
    const initial: PolicyNode[] = [
        { id: '1', name: 'Master Information Security Policy', sections: ['1. Introduction', '2. Roles', '3. DLP', '4. Assets'], google_doc_url: '#', status: 'Approved' },
        { id: '2', name: 'DLP Policy', sections: ['1. Scope', '2. Controls', '3. Enforcement'], google_doc_url: '#', status: 'Draft' },
        { id: '3', name: 'Asset Management Policy', sections: ['1. Inventory', '2. Classification', '3. Disposal'], google_doc_url: '#', status: 'Approved' }
    ];
    return initial;
};

export const savePolicyNodes = async (nodes: PolicyNode[]) => {
    localStorage.setItem('grc_policy_nodes', JSON.stringify(nodes));
};

export const getPolicyLinks = async (): Promise<PolicyLink[]> => {
    const stored = localStorage.getItem('grc_policy_links');
    if (stored) return JSON.parse(stored);
    return [];
};

export const savePolicyLinks = async (links: PolicyLink[]) => {
    localStorage.setItem('grc_policy_links', JSON.stringify(links));
};

export const getWorkflowTemplates = async (): Promise<WorkflowTemplate[]> => {
    const stored = localStorage.getItem('grc_workflow_templates');
    if (stored) return JSON.parse(stored);
    
    const initial: WorkflowTemplate[] = [
        { id: 't1', name: 'Standard Approval Template', steps: [
            { id: 's1', label: 'Draft', status: 'Completed' },
            { id: 's2', label: 'Peer Review', approverEmail: 'peer@company.com', status: 'Pending' },
            { id: 's3', label: 'CISO Approval', approverEmail: 'ciso@company.com', status: 'Pending' },
            { id: 's4', label: 'Approved', status: 'Pending' }
        ]}
    ];
    return initial;
};

export const saveWorkflowTemplates = async (templates: WorkflowTemplate[]) => {
    localStorage.setItem('grc_workflow_templates', JSON.stringify(templates));
};
