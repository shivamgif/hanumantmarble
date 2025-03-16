import * as React from "react"
import { useState, useCallback } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X, FileText, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "./button"

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.mjs`

export function CatalogueViewer() {
  const catalogues = [
    {
      name: "Full Body Tiles 60x120, 80x80, 60x60",
      path: "/fullbody-catalogue-60x120-80x80-60x60.pdf"
    },
    {
      name: "Wall Tiles Collection 2025",
      path: "/wall-tiles-catalogue-2025.pdf"
    },
    {
      name: "Designer Floor Collection",
      path: "/designer-floor-collection.pdf"
    }
  ]

  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedCatalogue, setSelectedCatalogue] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const containerRef = React.useRef(null)
  const dialogRef = React.useRef(null)

  // Update container dimensions on window resize
  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth)
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Handle document loading
  React.useEffect(() => {
    if (!selectedCatalogue) return

    setError(null)
    setIsLoading(true)
    
    pdfjs.getDocument(selectedCatalogue.path).promise
      .then(() => {
        setError(null)
      })
      .catch((err) => {
        setError("Failed to load catalogue. Please try again.")
        console.error("PDF loading error:", err)
      })
  }, [retry, selectedCatalogue])

  const onDocumentLoadSuccess = useCallback(({ numPages }) => {
    setNumPages(numPages)
    setIsLoading(false)
    setError(null)
  }, [])

  const handleError = useCallback((err) => {
    setIsLoading(false)
    setError("Failed to load catalogue. Please try again.")
    console.error("PDF error:", err)
  }, [])

  const handleRetry = useCallback(() => {
    setRetry(count => count + 1)
  }, [])

  function CatalogueSelection() {
    return (
      <div className="grid grid-cols-3 gap-4 overflow-auto flex-1 min-h-0 p-1">
        {catalogues.map((cat) => (
          <div
            key={cat.path}
            className="relative cursor-pointer rounded-lg overflow-hidden border-2 border-muted hover:border-border transition-all aspect-[3/4]"
            onClick={() => {
              setSelectedCatalogue(cat)
              setPageNumber(1)
              setIsLoading(true)
            }}
          >
            <Document
              file={cat.path}
              loading={null}
              error={null}
            >
              <Page
                pageNumber={1}
                width={300}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                loading={null}
              />
            </Document>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white text-sm font-medium">{cat.name}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function PDFViewer() {
    if (!selectedCatalogue) return null

    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedCatalogue(null)}
            className="gap-2"
          >
            <ArrowLeft className="h-3 w-3 m-0" /> 
          </Button>
          <h3 className="text-sm font-medium text-foreground/90">{selectedCatalogue.name}</h3>
        </div>

        <div 
          ref={containerRef} 
          className="flex-1 overflow-auto min-h-0 relative"
        >
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-sm text-muted-foreground">Loading catalogue...</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="flex flex-col items-center gap-4 text-center">
                <p className="text-destructive font-medium">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetry}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
          <Document
            file={selectedCatalogue.path}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            className="mx-auto w-full"
            onLoadError={handleError}
          >
            <Page
              pageNumber={pageNumber}
              className="mx-auto"
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
              width={Math.min(containerWidth * 0.95, 1100)}
              onRenderSuccess={() => setIsLoading(false)}
              onLoadError={handleError}
            />
          </Document>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(1)}
              disabled={pageNumber <= 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={pageNumber}
                onChange={(e) => {
                  const value = parseInt(e.target.value)
                  if (value >= 1 && value <= numPages) {
                    setPageNumber(value)
                  }
                }}
                className="w-16 rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              />
              <span className="text-sm text-muted-foreground">of {numPages || 1}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}
              disabled={pageNumber >= (numPages || 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(numPages || 1)}
              disabled={pageNumber >= (numPages || 1)}
            >
              Last
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button 
          variant="outline" 
          className="border-white/20 text-white hover:bg-white/10 hover:scale-105 transition-transform shimmer"
        >
          View Catalogue <FileText className="ml-2 h-4 w-4" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content ref={dialogRef} className="fixed left-[50%] top-[50%] z-50 h-[85vh] w-[90vw] max-w-[1200px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-card text-card-foreground p-6 shadow-lg border border-border">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-xl font-semibold text-foreground">
                {selectedCatalogue ? 'Product Catalogue' : 'Select a Catalogue'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            
            {selectedCatalogue ? <PDFViewer /> : <CatalogueSelection />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
