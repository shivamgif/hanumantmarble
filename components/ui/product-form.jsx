"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/hooks/useInView"

const Input = React.forwardRef(
  ({ className, type, label, error, onClear, isInView, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)
    const [value, setValue] = React.useState(
      props.value || props.defaultValue || "",
    )
    const inputRef = React.useRef(null)

    React.useImperativeHandle(ref, () => inputRef.current)

    const handleClear = () => {
      setValue("")
      onClear?.()
      inputRef.current?.focus()

      // Trigger change event
      const event = new Event("change", { bubbles: true })
      inputRef.current?.dispatchEvent(event)
    }

    return (
      <div className={cn(
        "w-full space-y-1.5 animate-on-scroll",
        isInView ? 'in-view' : ''
      )}>
        {label && (
          <label
            className="text-sm font-medium text-foreground/90"
            htmlFor={props.id}
          >
            {label}
          </label>
        )}

        <div className="relative">
          <input
            type={type}
            className={cn(
              "w-full px-3 py-2 rounded-lg",
              "bg-background",
              "border border-input",
              "text-sm text-foreground",
              "placeholder:text-muted-foreground",
              "transition-all duration-300",
              "focus:outline-none focus:ring-2 hover-scale",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              isFocused && !error && "border-primary scale-[1.02]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className,
            )}
            ref={inputRef}
            onChange={(e) => {
              setValue(e.target.value)
              props.onChange?.(e)
            }}
            onFocus={(e) => {
              setIsFocused(true)
              props.onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              props.onBlur?.(e)
            }}
            value={value}
            {...props}
          />

          {/* Clear button */}
          {value && onClear && (
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "absolute right-2 top-1/2 -translate-y-1/2",
                "p-1 rounded-md",
                "text-muted-foreground hover:text-foreground",
                "transition-colors float-on-scroll",
                isInView ? 'in-view' : ''
              )}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Error indicator */}
          {error && (
            <div className={cn(
              "absolute -right-6 top-1/2 -translate-y-1/2 scale-on-scroll",
              isInView ? 'in-view' : ''
            )}>
              <X className="h-4 w-4 text-destructive" />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className={cn(
            "text-sm text-destructive animate-on-scroll",
            isInView ? 'in-view' : ''
          )}>
            {error}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = "Input"

const Select = React.forwardRef(
  ({ className, label, error, options, isInView, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false)

    return (
      <div className={cn(
        "w-full space-y-1.5 animate-on-scroll",
        isInView ? 'in-view' : ''
      )}>
        {label && (
          <label
            className="text-sm font-medium text-foreground/90"
            htmlFor={props.id}
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            className={cn(
              "w-full px-3 py-2 rounded-lg appearance-none",
              "bg-background",
              "border border-input",
              "text-sm text-foreground",
              "transition-all duration-300",
              "focus:outline-none focus:ring-2 hover-scale",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              isFocused && !error && "border-primary scale-[1.02]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "pr-10", // Space for the dropdown icon
              className,
            )}
            ref={ref}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Dropdown icon */}
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg
              className={cn(
                "h-4 w-4 text-muted-foreground float-on-scroll",
                isInView ? 'in-view' : ''
              )}
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* Error indicator */}
          {error && (
            <div className={cn(
              "absolute -right-6 top-1/2 -translate-y-1/2 scale-on-scroll",
              isInView ? 'in-view' : ''
            )}>
              <X className="h-4 w-4 text-destructive" />
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <p className={cn(
            "text-sm text-destructive animate-on-scroll",
            isInView ? 'in-view' : ''
          )}>
            {error}
          </p>
        )}
      </div>
    )
  },
)
Select.displayName = "Select"

export function ProductForm({ className, onSubmit, isSubmitting, ...props }) {
  const [formData, setFormData] = React.useState({
    fullname: "",
    email: "",
    brand: "Kajaria",
    product: "",
    quantity: "",
  })

  const [errors, setErrors] = React.useState({})
  const [formRef, isFormInView] = useInView({ threshold: 0.1 })

  const validateForm = () => {
    const newErrors = {}

    if (!formData.fullname) {
      newErrors.fullname = "Name is required"
    }

    if (!formData.email) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Email is invalid"
    }

    if (!formData.product) {
      newErrors.product = "Product name is required"
    }

    if (!formData.quantity) {
      newErrors.quantity = "Quantity is required"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (validateForm()) {
      await onSubmit(formData)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Clear error when user types
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const brandOptions = [
    { value: "Kajaria", label: "Kajaria" },
    { value: "Cera", label: "Cera" },
  ]

  return (
    <form 
      ref={formRef}
      className={cn(
        "space-y-6 w-full max-w-md mx-auto p-8 rounded-xl shadow-sm fade-on-scroll", 
        isFormInView ? 'in-view' : '',
        className
      )} 
      onSubmit={handleSubmit}
      {...props}
    >
      <div className="space-y-4">
        <h2 className={cn(
          "text-3xl font-semibold text-center text-primary animate-on-scroll",
          isFormInView ? 'in-view' : ''
        )}>Get Your Quotation</h2>
      </div>

      <div className="space-y-4">
        <Input
          label="Full Name"
          name="fullname"
          placeholder="Enter your full name"
          value={formData.fullname}
          onChange={handleChange}
          error={errors.fullname}
          isInView={isFormInView}
          onClear={() => {
            setFormData((prev) => ({ ...prev, fullname: "" }))
            setErrors((prev) => ({ ...prev, fullname: "" }))
          }}
        />

        <Input
          label="Email Address"
          name="email"
          type="email"
          placeholder="Enter your email"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          isInView={isFormInView}
          onClear={() => {
            setFormData((prev) => ({ ...prev, email: "" }))
            setErrors((prev) => ({ ...prev, email: "" }))
          }}
        />

        <Select
          label="Select Brand"
          name="brand"
          options={brandOptions}
          value={formData.brand}
          onChange={handleChange}
          error={errors.brand}
          isInView={isFormInView}
        />

        <Input
          label="Product Name/Number"
          name="product"
          placeholder="Enter product name/number"
          value={formData.product}
          onChange={handleChange}
          error={errors.product}
          isInView={isFormInView}
          onClear={() => {
            setFormData((prev) => ({ ...prev, product: "" }))
            setErrors((prev) => ({ ...prev, product: "" }))
          }}
        />

        <Input
          label="Quantity"
          name="quantity"
          placeholder="Enter quantity"
          value={formData.quantity}
          onChange={handleChange}
          error={errors.quantity}
          isInView={isFormInView}
          onClear={() => {
            setFormData((prev) => ({ ...prev, quantity: "" }))
            setErrors((prev) => ({ ...prev, quantity: "" }))
          }}
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "w-full px-4 py-2 rounded-lg",
          "bg-primary text-primary-foreground",
          "text-base font-semibold",
          "transition-all duration-300",
          "hover:bg-primary/90 hover-scale",
          "focus:outline-none focus:ring-2 focus:ring-primary/20",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "scale-on-scroll shimmer",
          isFormInView ? 'in-view' : ''
        )}
      >
        {isSubmitting ? "Sending..." : "Get Quote"}
      </button>
    </form>
  )
}
