import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkState() {
  try {
    const jobStates = await prisma.importJob.groupBy({
      by: ['state'],
      _count: true
    });
    
    console.log('\n=== IMPORT JOB STATES ===');
    for (const group of jobStates) {
      console.log(group.state + ': ' + group._count);
    }
    
    const totalJobs = await prisma.importJob.count();
    console.log('TOTAL: ' + totalJobs);
    
    const totalVideos = await prisma.queueVideo.count();
    const importedVideos = await prisma.queueVideo.count({
      where: { transcriptId: { not: null } }
    });
    const pendingVideos = await prisma.queueVideo.count({
      where: { transcriptId: null }
    });
    
    console.log('\n=== QUEUE VIDEOS ===');
    console.log('Total videos: ' + totalVideos);
    console.log('Imported: ' + importedVideos);
    console.log('Pending: ' + pendingVideos);
    
    const queues = await prisma.queue.findMany({
      include: {
        _count: {
          select: { videos: true }
        }
      }
    });
    
    console.log('\n=== QUEUES ===');
    for (const queue of queues) {
      console.log(queue.name + ': ' + queue._count.videos + ' videos');
    }
    
    const recentJobs = await prisma.importJob.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        state: true,
        progress: true,
        error: true,
        createdAt: true,
        url: true
      }
    });
    
    console.log('\n=== RECENT IMPORT JOBS (last 10) ===');
    for (const job of recentJobs) {
      const shortUrl = job.url.slice(job.url.lastIndexOf('/') + 1);
      const shortId = job.id.slice(0, 8);
      console.log(shortId + ': ' + job.state + ' ' + job.progress + '% - ' + shortUrl);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkState();
