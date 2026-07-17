import { lazy, Suspense } from 'react'

const BradleysDarkSectorThreeJS = lazy(() => import('./components/BradleysDarkSectorThreeJS'))

function App() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-[#090d0a] font-mono text-sm uppercase tracking-[0.2em] text-[#b7c49a]">Loading tactical systems…</div>}>
      <BradleysDarkSectorThreeJS />
    </Suspense>
  )
}

export default App
