// Direct database script to regenerate all transcript descriptions with 120 character limit
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function generateDescription(transcript) {
  try {
    const textSample = transcript.text.substring(0, 2000);
    
    const prompt = `Create a very short description of this transcript (maximum 120 characters). Focus on the main topic only.

Title: ${transcript.title}
Channel: ${transcript.channel}
Content Sample: ${textSample}

Write a brief description (under 120 characters):`;

    const aiResponse = await fetch('http://localhost:8080/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        temperature: 0.3,
        n_predict: 80,
        stop: ['Content Sample:', 'Description:', 'Write a brief', '\n\n'],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let description = (aiData.content || aiData.completion || '').trim();
    
    // Clean up the description
    description = description
      .replace(/^["'`]|["'`]$/g, '')
      .replace(/^\s*Description:\s*/i, '')
      .replace(/^\s*Write a brief description.*?:\s*/i, '')
      .split('\n')[0]
      .trim();

    // Enforce 120 character limit
    if (description.length > 120) {
      description = description.substring(0, 117) + '...';
    }

    if (!description || description.length < 10) {
      const fallback = `Discussion about ${transcript.title.toLowerCase()} from ${transcript.channel}`;
      description = fallback.length > 120 ? fallback.substring(0, 117) + '...' : fallback;
    }

    return description;
  } catch (error) {
    console.error(`Error generating description for "${transcript.title}":`, error.message);
    const fallback = `Discussion about ${transcript.title.toLowerCase()} from ${transcript.channel}`;
    return fallback.length > 120 ? fallback.substring(0, 117) + '...' : fallback;
  }
}

async function regenerateAllDescriptions() {
  try {
    console.log('🚀 Starting description regeneration with 120 character limit...');
    
    // Get all transcripts
    const transcripts = await prisma.transcript.findMany({
      select: { id: true, title: true, channel: true, text: true }
    });

    console.log(`📊 Found ${transcripts.length} transcripts to process`);

    let processed = 0;
    let errors = 0;

    for (const transcript of transcripts) {
      try {
        console.log(`\n🔄 Processing: "${transcript.title}"`);
        
        const description = await generateDescription(transcript);
        
        // Update the transcript
        await prisma.transcript.update({
          where: { id: transcript.id },
          data: { description }
        });

        console.log(`✅ Generated (${description.length} chars): "${description}"`);
        processed++;
        
        // Small delay to avoid overwhelming the AI server
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`❌ Failed to process "${transcript.title}":`, error.message);
        errors++;
      }
    }

    console.log(`\n🎉 Regeneration completed!`);
    console.log(`✅ Processed: ${processed}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📊 Total: ${transcripts.length}`);
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateAllDescriptions();