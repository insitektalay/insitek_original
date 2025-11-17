import React from 'react'
import { render, screen } from '@testing-library/react'
import ImportPanel from '../ImportPanel.jsx'
import { ImportProvider } from '../../../contexts/ImportContext.jsx'
import { ImportContext } from '../../../contexts/ImportContext.jsx'

function renderWithContext(job) {
  return render(
    <ImportContext.Provider value={{ activeJob: job }}>
      <ImportPanel isImporting={false} />
    </ImportContext.Provider>
  )
}

describe('ImportPanel persistent banner', () => {
  it('hides banner when there is no active job', () => {
    renderWithContext(null)
    expect(screen.queryByText(/Importing/i)).toBeNull()
  })

  it('shows blue banner while processing', () => {
    const job = { id: '1', state: 'PROCESSING', stage: 'Downloading', progress: 20 }
    renderWithContext(job)
    const banner = screen.getByText(/Importing/i).parentElement
    expect(banner).toHaveClass('bg-blue-100')
  })

  it('shows green banner when done', () => {
    const job = { id: '1', state: 'DONE', stage: 'Completed', progress: 100 }
    renderWithContext(job)
    const banner = screen.getByText(/Import completed/i).parentElement
    expect(banner).toHaveClass('bg-green-100')
  })
}) 