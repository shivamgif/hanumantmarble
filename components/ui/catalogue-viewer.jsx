"use client"

import * as React from "react"
import { useState, useCallback } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X, FileText, ChevronLeft, ChevronRight, ArrowLeft, BookOpen, ZoomIn, ZoomOut, Download, Loader2 } from "lucide-react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "./button"
import { useLanguage } from "@/contexts/LanguageContext"
import { getTranslation } from "@/lib/translations"
import { cn } from "@/lib/utils"

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.mjs`

export function CatalogueViewer({ brand }) {
  const { language } = useLanguage()
  const allCatalogues = [
    {
      name: "Senator Catalogue October 2024",
      path: "/Cera Senator Catalogue October 2024_3.pdf",
      brand: "Cera"
    },
    {
      name: "Ceramics Wall North East",
      path: "/Kajaria Ceramics wall_north_east.pdf",
      brand: "Kajaria"
    },
    {
      name: "Eternity Fullbody Catalogue",
      path: "/Kajaria Eternity fullbody-catalogue-60x120-80x80-60x60.pdf",
      brand: "Kajaria Eternity"
    },
    {
      name: "Monochroma Collection",
      path: "/Varmora-Monochroma-Collection.pdf",
      brand: "Varmora"
    },
    {
      name: "Petrozza Collection",
      path: "/Varmora-Petrozza-Collection.pdf",
      brand: "Varmora"
    }
  ]

  const catalogues = brand 
    ? allCatalogues.filter(cat => cat.brand === brand)
    : allCatalogues

  const [numPages, setNumPages] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [selectedCatalogue, setSelectedCatalogue] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scale, setScale] = useState(1)
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
        setError(getTranslation('catalogue.error', language))
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
    setError(getTranslation('catalogue.error', language))
    console.error("PDF error:", err)
  }, [])

  const handleRetry = useCallback(() => {
    setRetry(count => count + 1)
  }, [])

  function CatalogueSelection() {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 overflow-auto flex-1 min-h-0 p-1">
        {catalogues.map((cat, index) => (
          <div
            key={cat.path}
            className={cn(
              "group relative cursor-pointer rounded-2xl overflow-hidden border border-border/50 bg-muted/30",
              "hover:border-primary/50 hover:shadow-xl hover:-translate-y-1 transition-all duration-300",
              "aspect-[3/4]"
            )}
            onClick={() => {
              setSelectedCatalogue(cat)
              setPageNumber(1)
              setScale(1)
              setIsLoading(true)
            }}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            {/* Thumbnail */}
            <div className="absolute inset-0">
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
                  className="opacity-90 group-hover:opacity-100 transition-opacity"
                />
              </Document>
            </div>
            
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-70 group-hover:opacity-90 transition-opacity" />
            
            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-end p-4">
              <div className="transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/20 text-white text-xs font-medium mb-2">
                  <BookOpen className="h-3 w-3" />
                  {cat.brand}
                </span>
                <h3 className="text-white font-semibold text-sm sm:text-base leading-tight">{cat.name}</h3>
              </div>
              
              {/* View button on hover */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <FileText className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  function PDFViewer() {
    if (!selectedCatalogue) return null

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 2))
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5))
    const handleDownload = () => window.open(selectedCatalogue.path, '_blank')

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with back button and title */}
        <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedCatalogue(null)}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ArrowLeft className="h-4 w-4" /> 
            </Button>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-foreground line-clamp-1">{selectedCatalogue.name}</h3>
              <p className="text-xs text-muted-foreground">{selectedCatalogue.brand}</p>
            </div>
          </div>
          
          {/* Zoom & Download Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={scale >= 2}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-2" />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              className="rounded-full h-8 w-8 hover:bg-primary/10"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* PDF Content */}
        <div 
          ref={containerRef} 
          className="flex-1 overflow-auto min-h-0 relative rounded-xl bg-muted/30"
        >
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{getTranslation('catalogue.loading', language)}</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-4 text-center p-6 max-w-sm">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="h-8 w-8 text-destructive" />
                </div>
                <p className="text-destructive font-medium">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetry}
                  className="rounded-full"
                >
                  {getTranslation('catalogue.tryAgain', language)}
                </Button>
              </div>
            </div>
          )}
          <Document
            file={selectedCatalogue.path}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={null}
            className="mx-auto w-full py-4"
            onLoadError={handleError}
          >
            <Page
              pageNumber={pageNumber}
              className="mx-auto shadow-2xl"
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
              width={Math.min(containerWidth * 0.95, 1100) * scale}
              onRenderSuccess={() => setIsLoading(false)}
              onLoadError={handleError}
            />
          </Document>
        </div>

        {/* Navigation Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 pt-4 mt-4">
          {/* Page navigation */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber(1)}
              disabled={pageNumber <= 1}
              className="hidden sm:inline-flex rounded-full h-8 px-3 text-xs hover:bg-primary/10"
            >
              {getTranslation('catalogue.first', language)}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50">
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
                className="w-10 sm:w-12 rounded-md border-0 bg-transparent px-1 py-0.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-sm text-muted-foreground">{getTranslation('catalogue.of', language)} {numPages || 1}</span>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}
              disabled={pageNumber >= (numPages || 1)}
              className="rounded-full h-9 w-9 hover:bg-primary/10"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPageNumber(numPages || 1)}
              disabled={pageNumber >= (numPages || 1)}
              className="hidden sm:inline-flex rounded-full h-8 px-3 text-xs hover:bg-primary/10"
            >
              {getTranslation('catalogue.last', language)}
            </Button>
          </div>
          
          {/* Mobile zoom controls */}
          <div className="flex sm:hidden items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={scale <= 0.5}
              className="rounded-full h-8 w-8"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">{Math.round(scale * 100)}%</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={scale >= 2}
              className="rounded-full h-8 w-8"
            >
              <ZoomIn className="h-4 w-4" />
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
          className="w-full group border border-primary/20 hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300 rounded-xl h-11"
        >
          <BookOpen className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
          {getTranslation('catalogue.viewButton', language)} 
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in" />
        <Dialog.Content 
          ref={dialogRef} 
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "h-[90vh] sm:h-[85vh] w-[95vw] sm:w-[90vw] max-w-[1200px]",
            "rounded-2xl bg-card text-card-foreground p-4 sm:p-6 shadow-2xl border border-border/50",
            "animate-scale-in"
          )}
        >
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Dialog.Title className="text-lg sm:text-xl font-semibold text-foreground">
                    {selectedCatalogue ? getTranslation('catalogue.title', language) : getTranslation('catalogue.selectTitle', language)}
                  </Dialog.Title>
                  {!selectedCatalogue && (
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {catalogues.length} catalogue{catalogues.length !== 1 ? 's' : ''} available
                    </p>
                  )}
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
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
