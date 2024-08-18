import React from 'react'
import { type RenderToPipeableStreamOptions, renderToPipeableStream } from 'react-dom/server'
import App from './App'
import { ChunkCollector, ChunkCollectorContext } from '../../src';

export function render(_url: string, collector: ChunkCollector, options?: RenderToPipeableStreamOptions) {
  return renderToPipeableStream(
    <React.StrictMode>
      <ChunkCollectorContext collector={collector}>
      <App />
      </ChunkCollectorContext>
    </React.StrictMode>,
    options
  )
}
