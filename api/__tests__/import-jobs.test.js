import request from 'supertest';

let findManyMock;

// Mock PrismaClient before importing the server
jest.mock('@prisma/client', () => {
  findManyMock = jest.fn();
  return {
    PrismaClient: jest.fn(() => ({
      importJob: {
        findMany: findManyMock,
      },
    })),
  };
});

// Dynamically import the ESM server after the mock is in place
let app;
beforeAll(async () => {
  const mod = await import('../../server.mjs');
  app = mod.app;
});

describe('GET /api/import-jobs', () => {
  it('returns 400 for invalid status filter', async () => {
    const res = await request(app).get('/api/import-jobs?status=invalid');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid status filter' });
  });

  it('returns active jobs when status=active', async () => {
    // Arrange the mock response
    const mockJobs = [
      { id: 'job1', state: 'PENDING', progress: 0 },
      { id: 'job2', state: 'PROCESSING', progress: 50 },
    ];
    findManyMock.mockResolvedValueOnce(mockJobs);

    const res = await request(app).get('/api/import-jobs?status=active');
    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { state: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true, state: true, progress: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.body).toEqual(mockJobs);
  });

  it('filters by a specific status (done)', async () => {
    const mockJobs = [{ id: 'job3', state: 'DONE', progress: 100 }];
    findManyMock.mockResolvedValueOnce(mockJobs);

    const res = await request(app).get('/api/import-jobs?status=done');
    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { state: 'DONE' },
      select: { id: true, state: true, progress: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.body).toEqual(mockJobs);
  });
}); 