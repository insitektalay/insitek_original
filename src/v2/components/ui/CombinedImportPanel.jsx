/* src/components/ui/CombinedImportPanel.jsx
   Combined import panel with all import features displayed vertically
   --------------------------------------------------------------- */
import { YoutubeIcon, RssIcon, ImageIcon } from 'lucide-react'
import ImportPanel from './ImportPanel'
import ChannelImportPanel from './ChannelImportPanel'
import PodcastImportPanel from './PodcastImportPanel'
import ImageUploadPanel from './ImageUploadPanel'

export default function CombinedImportPanel({ onDone, isImporting, importYoutube }) {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* YouTube Video Import Section */}
        <section className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <YoutubeIcon className="text-red-600" size={24} />
              <h2 className="text-xl font-semibold text-indigo-700">
                YouTube Video Import
              </h2>
            </div>
            <p className="text-gray-600 mb-4">
              Import individual YouTube videos by pasting their URLs
            </p>
            <ImportPanel
              onDone={onDone}
              isImporting={isImporting}
              importYoutube={importYoutube}
            />
          </div>
        </section>

        {/* YouTube Channel Import Section */}
        <section className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <YoutubeIcon className="text-red-600" size={24} />
              <h2 className="text-xl font-semibold text-indigo-700">
                YouTube Channel Import
              </h2>
            </div>
            <p className="text-gray-600 mb-4">
              Import multiple videos from a YouTube channel at once
            </p>
            <ChannelImportPanel />
          </div>
        </section>

        {/* RSS Podcast Import Section */}
        <section className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <RssIcon className="text-orange-500" size={24} />
              <h2 className="text-xl font-semibold text-indigo-700">
                RSS Podcast Import
              </h2>
            </div>
            <p className="text-gray-600 mb-4">
              Import podcast episodes from RSS feeds
            </p>
            <PodcastImportPanel onDone={onDone} />
          </div>
        </section>

        {/* Image Upload Section */}
        <section className="bg-white rounded-lg shadow-sm">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="text-purple-600" size={24} />
              <h2 className="text-xl font-semibold text-indigo-700">
                Image OCR Import
              </h2>
            </div>
            <p className="text-gray-600 mb-4">
              Upload images and extract text using OCR
            </p>
            <ImageUploadPanel onDone={onDone} />
          </div>
        </section>
      </div>
    </div>
  )
}