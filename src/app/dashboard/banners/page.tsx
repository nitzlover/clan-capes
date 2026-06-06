import { redirect } from 'next/navigation';

/**
 * Banners was folded into the unified clan hub — every clan's banner now lives
 * in its row on /dashboard/clans (Banner tab). Keep this route as a redirect so
 * old links / bookmarks don't 404.
 */
export default function BannersRedirect() {
  redirect('/dashboard/clans');
}
