// Shared chart design tokens for the dashboard — one palette, one tooltip style,
// consistent status/category colors. Import these instead of re-declaring inline
// styles per card so the charts share a coherent look.

export const CHART_TOOLTIP_STYLE = {
    backgroundColor: '#1f2937',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
} as const;

// Enforcement status colors (controls).
export const STATUS_COLORS = {
    enforced: '#10b981',
    inReview: '#f59e0b',
    notEnforced: '#9ca3af',
};

// Policy workflow status colors + labels.
export const POLICY_STATUS_COLORS: Record<string, string> = {
    approved: '#10b981',
    reviewed: '#22c55e',
    in_approval: '#3b82f6',
    to_review: '#f59e0b',
    draft: '#9ca3af',
};

export const POLICY_STATUS_LABELS: Record<string, string> = {
    approved: 'Approved',
    reviewed: 'Reviewed',
    in_approval: 'In Approval',
    to_review: 'To Review',
    draft: 'Draft',
};

// Control category colors (inner ring of the Controls Coverage sunburst).
export const CATEGORY_COLORS: Record<string, string> = {
    Standard: '#3b82f6',
    Regulatory: '#8b5cf6',
    NN: '#06b6d4',
    Other: '#9ca3af',
};

// General-purpose categorical palette.
export const CHART_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#ec4899', '#14b8a6'];
