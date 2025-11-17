import React, { createContext, useContext, useState, useMemo, useCallback } from 'react'

const ImportContext = createContext(undefined)

export function ImportProvider({ children }) {
  const [activeJob, setActiveJob] = useState(null)

  const clearJob = useCallback(() => setActiveJob(null), [])

  const value = useMemo(
    () => ({ activeJob, setActiveJob, clearJob }),
    [activeJob, clearJob]
  )

  return (
    <ImportContext.Provider value={value}>{children}</ImportContext.Provider>
  )
}

export function useImportContext() {
  const ctx = useContext(ImportContext)
  if (!ctx) {
    throw new Error('useImportContext must be used within an ImportProvider')
  }
  return ctx
} 