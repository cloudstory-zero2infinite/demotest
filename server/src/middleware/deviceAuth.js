import crypto from 'crypto';
import { supabaseAdmin } from '../supabase.js';

export function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

// Authenticates the zti-hub CLI via a device token (NOT a Supabase JWT).
// The token is sent either as `X-ZTI-Device-Token: <raw>` or as a Bearer token
// prefixed `zti_`. We store only the sha256 hash, so we hash and look up.
export const requireDevice = async (req, res, next) => {
  try {
    let raw = req.headers['x-zti-device-token'];
    if (!raw) {
      const auth = req.headers.authorization || '';
      if (auth.startsWith('Bearer ') && auth.slice(7).startsWith('zti_')) {
        raw = auth.slice(7);
      }
    }
    if (!raw) return res.status(401).json({ error: 'No device token provided' });

    const { data: device, error } = await supabaseAdmin
      .from('zti_hub_devices')
      .select('id, org_id, user_id, device_name, gcp_integrated, gcp_project_id, revoked_at')
      .eq('token_hash', hashToken(raw))
      .maybeSingle();

    if (error) throw error;
    if (!device || device.revoked_at) {
      return res.status(401).json({ error: 'Invalid or revoked device token' });
    }

    req.deviceId = device.id;
    req.orgId = device.org_id;
    req.userId = device.user_id;
    req.device = device;
    next();
  } catch (err) {
    console.error('Device auth middleware error:', err);
    res.status(500).json({ error: 'Device authentication error' });
  }
};
