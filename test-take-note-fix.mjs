#!/usr/bin/env node
// test-take-note-fix.mjs
// Quick test to verify the take_note tool fix

const API_URL = 'http://localhost:3001';

// Use a real transcript ID from the test
const TEST_TRANSCRIPT_ID = '2121847e-23b2-4264-b29a-d37b1dbf0abf';

async function testTakeNoteFix() {
  console.log('🧪 Testing take_note tool fix...\n');

  try {
    // Step 1: Create a test document
    console.log('1️⃣  Creating test document...');
    const createResponse = await fetch(`${API_URL}/api/documents/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcriptIds: [TEST_TRANSCRIPT_ID],
        documentType: 'Test Note Fix',
        customInstructions: `Create a simple document with one section. Test the take_note tool by:
1. Searching transcripts for "AI agents"
2. Taking 3 notes with source parameter included
3. Creating one section
4. Writing content using the notes

This is a minimal test to verify the take_note fix works.`,
        variant: 'scalable'
      })
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create document: ${createResponse.status}`);
    }

    const { documentId } = await createResponse.json();
    console.log(`   ✅ Document created: ${documentId}\n`);

    // Step 2: Poll for completion
    console.log('2️⃣  Waiting for generation to complete...');
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    let status, document;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`${API_URL}/api/documents/${documentId}/status`);
      const statusData = await statusResponse.json();

      status = statusData.status;
      document = statusData.document;

      console.log(`   Status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

      if (status === 'COMPLETED' || status === 'ERROR') {
        break;
      }

      attempts++;
    }

    console.log('');

    // Step 3: Check results
    if (status === 'COMPLETED') {
      console.log('✅ Test PASSED - Document generated successfully!\n');

      // Check if notes were created
      const notes = document.notes || [];
      console.log(`📝 Notes created: ${notes.length}`);

      if (notes.length > 0) {
        console.log('   Sample notes:');
        notes.slice(0, 3).forEach((note, i) => {
          console.log(`   ${i + 1}. [${note.importance}] ${note.content.substring(0, 60)}...`);
          console.log(`      Source: ${note.sourceTranscriptId ? '✅ Included' : '❌ Missing'}`);
        });
        console.log('');

        // Check if all notes have source
        const notesWithSource = notes.filter(n => n.sourceTranscriptId);
        const successRate = (notesWithSource.length / notes.length * 100).toFixed(1);
        console.log(`🎯 Notes with source: ${notesWithSource.length}/${notes.length} (${successRate}%)`);

        if (successRate === '100.0') {
          console.log('✅ SUCCESS - All notes include source parameter!');
        } else {
          console.log('⚠️  WARNING - Some notes missing source parameter');
        }
      } else {
        console.log('⚠️  WARNING - No notes were created');
      }

    } else if (status === 'ERROR') {
      console.log('❌ Test FAILED - Document generation encountered an error\n');
      console.log('Error:', document.error || 'Unknown error');

      // Check agent log for take_note failures
      if (document.agentLog) {
        const takeNoteFailures = document.agentLog
          .split('\n')
          .filter(line => line.includes('take_note') && line.includes('failed'));

        if (takeNoteFailures.length > 0) {
          console.log('\n❌ take_note failures found:');
          takeNoteFailures.forEach(failure => console.log('   ', failure));
        }
      }
    } else {
      console.log('⏱️  Test TIMEOUT - Document generation did not complete in time');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
testTakeNoteFix().then(() => {
  console.log('\n🏁 Test complete');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
