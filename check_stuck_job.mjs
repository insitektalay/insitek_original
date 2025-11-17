import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkStuckJob() {
  try {
    const processingJob = await prisma.importJob.findFirst({
      where: { state: 'PROCESSING' }
    });
    
    if (processingJob) {
      console.log('\n=== STUCK PROCESSING JOB ===');
      console.log('ID:', processingJob.id);
      console.log('URL:', processingJob.url);
      console.log('State:', processingJob.state);
      console.log('Progress:', processingJob.progress + '%');
      console.log('Created:', processingJob.createdAt);
      console.log('Updated:', processingJob.updatedAt);
      console.log('Error:', processingJob.error || 'none');
      
      const now = new Date();
      const timeSinceUpdate = Math.floor((now - processingJob.updatedAt) / 1000 / 60);
      console.log('Minutes since last update:', timeSinceUpdate);
    } else {
      console.log('No PROCESSING jobs found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkStuckJob();
