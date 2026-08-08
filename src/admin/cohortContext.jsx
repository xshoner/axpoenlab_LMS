import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const CohortCtx = createContext(null)

export function CohortProvider({ children }) {
  const [cohorts, setCohorts] = useState([])
  const [selectedId, setSelectedId] = useState(localStorage.getItem('ax-admin-cohort') || '')

  const reload = useCallback(async () => {
    const { data } = await supabase.from('cohorts').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setCohorts(data || [])
  }, [])

  useEffect(() => { reload() }, [reload])

  const select = (id) => {
    setSelectedId(id)
    localStorage.setItem('ax-admin-cohort', id)
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
