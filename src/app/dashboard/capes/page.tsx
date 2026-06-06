import { redirect } from 'next/navigation';

/**
 * Capes was folded into the unified clan hub — every clan's cape now lives in
 * its row on /dashboard/clans (Cape tab). Keep this route as a redirect so old
 * links / bookmarks don't 404.
 */
export default function CapesRedirect() {
  redirect('/dashboard/clans');
}
