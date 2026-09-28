export type AppPage = 'home' | 'channels' | 'favorites' | 'watch';
export interface AppRoute { page: AppPage; channelId: string; category: string; country: string; query: string; favoritesOnly?: boolean; }
export function readRoute(search: string): AppRoute {
  const params = new URLSearchParams(search);
  const channelId = params.get('chaine') || '';
  const page: AppPage = channelId ? 'watch' : params.get('page') === 'chaines' ? 'channels' : params.get('page') === 'favoris' ? 'favorites' : 'home';
  return { page, channelId, category: params.get('categorie') || '', country: params.get('pays') || '', query: params.get('q') || '', ...(page === 'watch' && params.get('favoris') === '1' ? { favoritesOnly: true } : {}) };
}
export function routeHref(page: AppPage, options: Partial<Omit<AppRoute, 'page'>> = {}): string {
  const params = new URLSearchParams();
  if (page === 'watch' && options.channelId) params.set('chaine', options.channelId);
  if (page === 'channels') params.set('page', 'chaines');
  if (page === 'favorites') params.set('page', 'favoris');
  if (page === 'channels' || page === 'favorites' || page === 'watch') {
    if (options.category) params.set('categorie', options.category);
    if (options.country) params.set('pays', options.country);
    if (options.query) params.set('q', options.query);
    if (page === 'watch' && options.favoritesOnly) params.set('favoris', '1');
  }
  return params.size ? `/?${params}` : '/';
}
