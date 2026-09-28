import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getAdminView } from '../lib/supabase'
import { useAuth } from '../shared/auth'

const CohortCtx = createContext(null)

export function CohortProvider({ children }) {
  const { profile } = useAuth()
  const storageKey = `ax-admin-cohort:${profile.id}:${getAdminView()?.id || 'self'}`
  const [cohorts, setCohorts] = useState([])
  const [selectedId, setSelectedId] = useState(localStorage.getItem(storageKey) || '')

  const reload = useCallback(async () => {
    const { data } = await supabase.from('cohorts').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setCohorts(data || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  const select = (id) => {
    setSelectedId(id)
    localStorage.setItem(storageKey, id)
  }

  const selected = cohorts.find((c) => c.id === selectedId) || null

  return (
    <CohortCtx.Provider value={{ cohorts, selected, selectedId: selected ? selectedId : '', select, reload }}>
      {children}
    </CohortCtx.Provider>
  )
}

export function useCohort() {
  return useContext(CohortCtx)
}
