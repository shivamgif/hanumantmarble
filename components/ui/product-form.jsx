"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/hooks/useInView"

const Input = React.forwardRef(
  ({ className, type, label, error, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
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
              "focus:outline-none focus:ring-2",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              className,
            )}
            ref={ref}
            {...props}
          />
          {error && (
            <div className="absolute -right-6 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-destructive" />
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = "Input"

const Select = React.forwardRef(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
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
              "focus:outline-none focus:ring-2",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "pr-10", // Space for the dropdown icon
              className,
            )}
            ref={ref}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <svg
              className="h-4 w-4 text-muted-foreground"
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
          {error && (
            <div className="absolute -right-6 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-destructive" />
            </div>
          )}
        </div>
        {error && (
          <p className="text-sm text-destructive">
            {error.message}
          </p>
        )}
      </div>
    )
  },
)
Select.displayName = "Select"

export function ProductForm({ className, ...props }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();
  const [formRef, isFormInView] = useInView({ threshold: 0.1 });

  const onSubmit = async (data) => {
    // Rate limiting check
    const lastSubmitTime = localStorage.getItem('lastQuoteSubmitTime')
    const now = Date.now()
    if (lastSubmitTime && now - parseInt(lastSubmitTime) < 60000) { // 1 minute cooldown
      alert('Please wait a minute before requesting another quote.')
      return
    }

    // Show confirmation dialog
    if (!window.confirm('You will be redirected to your default email application to send the quote request. Continue?')) {
      return
    }

    // Store submission time for rate limiting
    localStorage.setItem('lastQuoteSubmitTime', now.toString())

    // Format email content
    const emailSubject = encodeURIComponent(`Quote Request for ${data.brand} ${data.product}`)
    const emailBody = encodeURIComponent(
      `Dear Hanumant Marble Team,\n\n` +
      `I would like to request a quote for the following:\n\n` +
      `Product Details:\n` +
      `- Brand: ${data.brand}\n` +
      `- Product Name/Number: ${data.product}\n` +
      `- Quantity: ${data.quantity}\n\n` +
      `Contact Information:\n` +
      `- Name: ${data.fullname}\n` +
      `- Email: ${data.email}\n` +
      `- Mobile: ${data.mobile || 'Not provided'}\n\n` +
      `I look forward to hearing from you.\n\n` +
      `Best regards,\n` +
      `${data.fullname}`
    )

    // Open email client
    window.location.href = `mailto:hanumantmarble@rediffmail.com?subject=${emailSubject}&body=${emailBody}`
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
      onSubmit={handleSubmit(onSubmit)}
      {...props}
      netlify
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
          {...register("fullname", { required: "Name is required" })}
          placeholder="Enter your full name"
          error={errors.fullname}
        />

        <Input
          label="Email Address"
          type="email"
          {...register("email", { 
            required: "Email is required",
            pattern: {
              value: /\S+@\S+\.\S+/,
              message: "Email is invalid"
            }
          })}
          placeholder="Enter your email"
          error={errors.email}
        />

        <Input
          label="Mobile Number"
          type="tel"
          {...register("mobile")}
          placeholder="Enter your mobile number"
          error={errors.mobile}
        />

        <Select
          label="Select Brand"
          {...register("brand")}
          options={brandOptions}
          error={errors.brand}
        />

        <Input
          label="Product Name/Number"
          {...register("product", { required: "Product name is required" })}
          placeholder="Enter product name/number"
          error={errors.product}
        />

        <Input
          label="Quantity"
          {...register("quantity", { required: "Quantity is required" })}
          placeholder="Enter quantity"
          error={errors.quantity}
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
