import * as React from "react"
import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X, FileText } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "./button"

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`

export function CatalogueViewer() {
  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(true)

  // Preload the PDF worker
  React.useEffect(() => {
    pdfjs.getDocument("/fullbody-catalogue-60x120-80x80-60x60.pdf").promise
  }, [])

  function onDocumentLoadSuccess({ numPages }) {
    setNumPages(numPages)
    setIsLoading(false)
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button 
          variant="outline" 
          className="border-white/20 text-white hover:bg-white/10 hover-scale shimmer"
        >
          View Catalogue <FileText className="ml-2 h-4 w-4" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[85vh] w-[90vw] max-w-[1200px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white p-6 shadow-lg">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold">
                Product Catalogue
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            
            <div className="flex-1 overflow-auto relative min-h-[60vh]">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    <p className="text-sm text-gray-500">Loading catalogue...</p>
                  </div>
                </div>
              )}
              <Document
                file="/fullbody-catalogue-60x120-80x80-60x60.pdf"
                onLoadSuccess={onDocumentLoadSuccess}
                loading={null}
                className="mx-auto"
              >
                <Page
                  pageNumber={pageNumber}
                  className="mx-auto"
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                  scale={1.0}
                  onRenderSuccess={() => setIsLoading(false)}
                  onLoadError={() => setIsLoading(false)}
                />
              </Document>
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-gray-500">
                Page {pageNumber} of {numPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                  disabled={pageNumber <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                  disabled={pageNumber >= numPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
