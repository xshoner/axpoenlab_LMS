import { Component } from 'react'
import { supabase } from '../lib/supabase'

let lastReport = 0
export function reportClientError(category, code = 'UNEXPECTED') {
  // Never upload message bodies, URLs, tokens, stacks or user input.
  if (Date.now() - lastReport < 10000) return
  lastReport = Date.now()
  void Promise.resolve(supabase.rpc('record_client_error', {
    p_category: category,
    p_code: /^[A-Z0-9_-]{1,40}$/.test(code) ? code : 'UNEXPECTED',
  })).catch(() => {})
}
export function LoadError({ retry, title = '화면을 불러오지 못했습니다' }) {
  return <div className="empty-state" role="alert">
    <div className="t-h3">{title}</div>
    <p className="t-muted-sm">연결을 확인한 뒤 다시 시도해 주세요.</p>
    <button className="btn btn-white" onClick={retry}>다시 시도</button>
  </div>
}
export class ErrorBoundary extends Component {
  state = { failed: false }
  reportUnexpected = () => reportClientError('unexpected', 'UNHANDLED_ERROR')
  componentDidMount() {
    window.addEventListener('error', this.reportUnexpected)
    window.addEventListener('unhandledrejection', this.reportUnexpected)
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.reportUnexpected)
    window.removeEventListener('unhandledrejection', this.reportUnexpected)
  }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { reportClientError('render', 'RENDER_FAILED') }
  render() {
    return this.state.failed ? <LoadError retry={() => window.location.reload()} /> : this.props.children
  }
}
