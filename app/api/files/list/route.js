import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { blobs } = await list();
    
    // Sort by upload date (newest first)
    const sortedBlobs = blobs
      .filter(blob => blob.pathname.endsWith('.csv'))
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .map(blob => ({
        filename: blob.pathname,
        url: blob.url,
        size: blob.size,
        uploadedAt: blob.uploadedAt
      }));

    return NextResponse.json({ files: sortedBlobs });
  } catch (error) {
    console.error('List error:', error);
    return NextResponse.json({ files: [], error: error.message });
  }
}
