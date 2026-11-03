// Public project credentials only. Database writes remain protected by RLS.
export const project = 'https://aswyecjfjayvrlijmwzl.supabase.co';
export const publishableKey = 'sb_publishable_cvYDFPLXXh8GsjghlxT34w_g8js-pZ6';
export const validPdf = value => /^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.pdf$/.test(value || '');
export function validUpload(value, kind = 'pdf') {
  const extensions = { pdf: 'pdf', audio: 'mp3|m4a|wav|ogg|aac', video: 'mp4|webm|mov' };
  return !!extensions[kind] && new RegExp('^https://u\\.pone\\.rs/[A-Za-z0-9]+\\.(' + extensions[kind] + ')$', 'i').test(value || '');
}
export async function cloudSource(id, signal) {
  const response = await fetch(`${project}/rest/v1/story_books?id=eq.${encodeURIComponent(id)}&select=source_url&limit=1`, { headers: { apikey: publishableKey }, signal });
  if (!response.ok) throw new Error('Book catalogue unavailable');
  const rows = await response.json();
  return validPdf(rows[0]?.source_url) ? rows[0].source_url : null;
}
