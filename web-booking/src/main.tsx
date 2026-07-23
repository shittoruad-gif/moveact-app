import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { BookingFlow } from './App.tsx'
import { CancelPage } from './components/CancelPage.tsx'
import { LineCallback } from './components/LineCallback.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* キャンセル・変更ページ（slug より先にマッチさせる） */}
        <Route path="/cancel/:token" element={<CancelPage />} />
        {/* LINEログインのhttps中継（slug より先に） */}
        <Route path="/line-callback" element={<LineCallback />} />
        {/* /menu/:menuSlug = メニュー個別URL（そのメニューだけ表示） */}
        <Route path="/menu/:menuSlug" element={<BookingFlow />} />
        {/* / = おまかせ、/:slug = 担当者指名 or 店舗別 */}
        <Route path="/" element={<BookingFlow />} />
        <Route path="/:slug" element={<BookingFlow />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
