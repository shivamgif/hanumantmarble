import { create } from "zustand"

function createInitialAttachmentState() {
  return {
    purchaseInvoice: null,
    transporterBill: null,
    salesInvoice: null,
    gatepass: null,
  }
}

export const useStockFormStore = create((set) => ({
  arrivalSheetOpen: false,
  dispatchSheetOpen: false,
  arrivalAttachments: createInitialAttachmentState(),
  dispatchAttachments: createInitialAttachmentState(),
  setArrivalSheetOpen: (open) => set({ arrivalSheetOpen: open }),
  setDispatchSheetOpen: (open) => set({ dispatchSheetOpen: open }),
  setArrivalAttachment: (key, file) =>
    set((state) => ({
      arrivalAttachments: {
        ...state.arrivalAttachments,
        [key]: file,
      },
    })),
  setDispatchAttachment: (key, file) =>
    set((state) => ({
      dispatchAttachments: {
        ...state.dispatchAttachments,
        [key]: file,
      },
    })),
  resetArrivalAttachments: () => set({ arrivalAttachments: createInitialAttachmentState() }),
  resetDispatchAttachments: () => set({ dispatchAttachments: createInitialAttachmentState() }),
}))
