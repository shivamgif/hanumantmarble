"use server"

export async function submitForm(formData) {
  try {
    const data = {
      fullname: formData.get("fullname"),
      email: formData.get("email"),
      mobile: formData.get("mobile"),
      brand: formData.get("brand"),
      product: formData.get("product"),
      quantity: formData.get("quantity"),
    };

    // Submit to Netlify's form handling endpoint
    const response = await fetch("/.netlify/functions/submission-created", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        form_name: "product-quote",
        form_data: data,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to submit form");
    }

    return { success: true };
  } catch (error) {
    console.error("Form submission error:", error);
    return { success: false, error: error.message };
  }
}
