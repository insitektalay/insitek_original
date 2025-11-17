import { render, screen } from '@testing-library/react'
import React from 'react'
import { ImportProvider, useImportContext } from '../ImportContext.jsx'

function DisplayJob() {
  const { activeJob, setActiveJob, clearJob } = useImportContext()
  return (
    <div>
      <span data-testid="job-id">{activeJob?.id ?? 'none'}</span>
      <button onClick={() => setActiveJob({ id: 'abc' })}>set</button>
      <button onClick={clearJob}>clear</button>
    </div>
  )
}

describe('ImportContext', () => {
  it('provides default activeJob null', () => {
    render(
      <ImportProvider>
        <DisplayJob />
      </ImportProvider>
    )

    expect(screen.getByTestId('job-id').textContent).toBe('none')
  })

  it('updates activeJob via setActiveJob and clearJob', () => {
    render(
      <ImportProvider>
        <DisplayJob />
      </ImportProvider>
    )

    const jobSpan = screen.getByTestId('job-id')

    // Click set -> updates to abc
    screen.getByText('set').click()
    expect(jobSpan.textContent).toBe('abc')

    // Click clear -> back to none
    screen.getByText('clear').click()
    expect(jobSpan.textContent).toBe('none')
  })
}) 