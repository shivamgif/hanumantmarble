"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { X, CheckCircle2, Send, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/hooks/useInView"

const WHATSAPP_NUMBER = "919696103802";

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
              "w-full px-3 py-2.5 rounded-lg",
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
          <p className="text-sm text-destructive">{error.message}</p>
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
              "w-full px-3 py-2.5 rounded-lg appearance-none",
              "bg-background",
              "border border-input",
              "text-sm text-foreground",
              "transition-all duration-300",
              "focus:outline-none focus:ring-2",
              error && "border-destructive focus:ring-destructive/20",
              !error && "focus:ring-primary/20",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "pr-10",
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
            <svg className="h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}
      </div>
    )
  },
)
Select.displayName = "Select"

// Rate limit: 1 minute between submissions
function checkRateLimit() {
  if (typeof window === "undefined") return true;
  const last = localStorage.getItem("lastQuoteSubmitTime");
  if (last && Date.now() - parseInt(last) < 60000) {
    return false;
  }
  return true;
}

export function ProductForm({ className, ...props }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();
  const [formRef, isFormInView] = useInView({ threshold: 0.1 });
  const [submitted, setSubmitted] = React.useState(false);
  const [rateLimited, setRateLimited] = React.useState(false);

  const brandOptions = [
    { value: "", label: "Select a brand…" },
    { value: "Kajaria", label: "Kajaria" },
    { value: "Kajaria Eternity", label: "Kajaria Eternity" },
    { value: "Cera", label: "Cera" },
    { value: "Varmora", label: "Varmora" },
    { value: "Other", label: "Other" },
  ]

  const buildEmailBody = (data) =>
    `Dear Hanumant Marble Team,\n\n` +
    `I would like to request a quote for the following:\n\n` +
    `Product Details:\n` +
    `- Brand: ${data.brand}\n` +
    `- Product Name/Number: ${data.product}\n` +
    `- Quantity: ${data.quantity}\n\n` +
    `Contact Information:\n` +
    `- Name: ${data.fullname}\n` +
    `- Email: ${data.email}\n` +
    `- Mobile: ${data.mobile || "Not provided"}\n\n` +
    `Best regards,\n${data.fullname}`;

  const onSubmit = (data) => {
    if (!checkRateLimit()) {
      setRateLimited(true);
      return;
    }

    localStorage.setItem("lastQuoteSubmitTime", Date.now().toString());

    const emailSubject = encodeURIComponent(`Quote Request for ${data.brand} ${data.product}`);
    const emailBody = encodeURIComponent(buildEmailBody(data));
    window.location.href = `mailto:hanumantmarble@rediffmail.com?subject=${emailSubject}&body=${emailBody}`;

    setSubmitted(true);
    reset();
  };

  const handleWhatsApp = (data) => {
    const message = encodeURIComponent(
      `Hi! I'd like a quote for:\nBrand: ${data.brand}\nProduct: ${data.product}\nQty: ${data.quantity}\nName: ${data.fullname}\nPhone: ${data.mobile || "N/A"}`
    );
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, "_blank", "noopener,noreferrer");
    setSubmitted(true);
    reset();
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-6 animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h3 className="text-2xl font-bold mb-2">Quote Request Sent!</h3>
          <p className="text-muted-foreground max-w-xs">
            Your email app has opened with all the details. We'll get back to you within 24 hours.
          </p>
        </div>
        <button
          onClick={() => setSubmitted(false)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Submit another request
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className={cn(
        "space-y-5 w-full fade-on-scroll",
        isFormInView ? "in-view" : "",
        className
      )}
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {rateLimited && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          Please wait a minute before submitting another request.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          id="fullname"
          label="Full Name *"
          {...register("fullname", { required: "Name is required" })}
          placeholder="Your full name"
          error={errors.fullname}
          autoComplete="name"
        />
        <Input
          id="email"
          label="Email Address *"
          type="email"
          {...register("email", {
            required: "Email is required",
            pattern: { value: /\S+@\S+\.\S+/, message: "Invalid email address" },
          })}
          placeholder="you@example.com"
          error={errors.email}
          autoComplete="email"
        />
      </div>

      <Input
        id="mobile"
        label="Mobile Number"
        type="tel"
        {...register("mobile", {
          pattern: { value: /^[6-9]\d{9}$/, message: "Enter a valid 10-digit Indian mobile number" },
        })}
        placeholder="+91 98765 43210"
        error={errors.mobile}
        autoComplete="tel"
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Select
          id="brand"
          label="Brand *"
          {...register("brand", { required: "Please select a brand", validate: (v) => v !== "" || "Please select a brand" })}
          options={brandOptions}
          error={errors.brand}
        />
        <Input
          id="quantity"
          label="Quantity *"
          {...register("quantity", { required: "Quantity is required" })}
          placeholder="e.g. 50 boxes"
          error={errors.quantity}
        />
      </div>

      <Input
        id="product"
        label="Product Name / Number *"
        {...register("product", { required: "Product name is required" })}
        placeholder="e.g. Kajaria Evoque Beige 600x600"
        error={errors.product}
      />

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl",
            "bg-primary text-primary-foreground font-semibold text-sm",
            "transition-all duration-300 hover:bg-primary/90 hover:scale-[1.02]",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <Send className="w-4 h-4" aria-hidden="true" />
          {isSubmitting ? "Opening email…" : "Send via Email"}
        </button>

        <button
          type="button"
          onClick={handleSubmit(handleWhatsApp)}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl",
            "bg-[#25D366] hover:bg-[#20BD5A] text-white font-semibold text-sm",
            "transition-all duration-300 hover:scale-[1.02]",
            "focus:outline-none focus:ring-2 focus:ring-[#25D366]/30",
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          Send via WhatsApp
        </button>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        * Required fields. We'll respond within 24 hours.
      </p>
    </form>
  )
}
