import { lazy, Suspense, useEffect, useState } from 'react'
import { companyManaged } from './company-config'
const AdminEntry = lazy(() => import('./AdminEntry'))
const PublicSite = lazy(() => import('./PublicSite'))
const publicRoute = () => ['#home', '#products', '#contact'].includes(location.hash) || companyManaged && !location.hash
export default function SiteRouter() {
  const [isPublic, setPublic] = useState(publicRoute)
  useEffect(() => {
    const change = () => setPublic(publicRoute())
    window.addEventListener('hashchange', change)
    window.addEventListener('popstate', change)
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('popstate', change) }
  }, [])
  return <Suspense fallback={<main className="company-entry" role="status">Đang mở trang…</main>}>{isPublic ? <PublicSite /> : <AdminEntry />}</Suspense>
}
