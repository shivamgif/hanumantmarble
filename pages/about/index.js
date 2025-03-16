import Head from "next/head";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

export default function About() {

  const galleryImages = [
    "/hero1.png",
    "/hero2.jpeg",
    "/hero3.jpeg",
    "/hero1.png",
    "/hero2.jpeg",
    "/hero3.jpeg",
  ];

  const awards = [
    {
      year: "2022",
      title: "Best Marble Supplier",
      organization: "Indian Stone Industry Awards",
    },
    {
      year: "2021",
      title: "Excellence in Customer Service",
      organization: "Construction Excellence Awards",
    },
    {
      year: "2020",
      title: "Quality Achievement Award",
      organization: "Natural Stone Council",
    },
  ];

  return (
    <>
      <Head>
        <title>About Us - Hanumant Marble</title>
        <meta 
          name="description" 
          content="Learn about Hanumant Marble's 25+ years of experience in providing premium marble and granite products with unmatched quality and service."
        />
      </Head>
      <div className="container mx-auto px-4 py-16 space-y-20">
        {/* Hero Section */}
        <section className="text-center space-y-12">

          <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">About Us</h1>
          <p className="text-xl text-muted-foreground mx-auto max-w-3xl leading-relaxed">
            With over 25 years of experience in the natural stone industry, Hanumant
            Marble has established itself as a leading supplier of premium marble and
            granite products.
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
              <p className="leading-relaxed text-muted-foreground">
                Our commitment to quality and customer satisfaction has made us the
                preferred choice for architects, interior designers, and homeowners.
                We source our materials from the finest quarries worldwide to ensure
                superior quality and unique patterns.
              </p>
            </div>
            <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
              <p className="leading-relaxed text-muted-foreground">
                Our state-of-the-art facility and experienced team ensure precise
                cutting, polishing, and finishing of every stone piece. We take pride
                in our vast inventory and ability to cater to projects of any scale.
              </p>
            </div>
          </div>
        </section>

        {/* Gallery Section */}
        <section className="space-y-8">
          <h2 className="text-3xl font-bold tracking-tight text-center">Gallery</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div 
                key={index} 
                className="group relative h-64 rounded-lg overflow-hidden border bg-card shadow-sm transition-all hover:shadow-lg"
              >
                <Image
                  src={image}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
                  <Badge variant="secondary" className="text-sm">
                    View Image
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Awards Section */}
        <section className="space-y-8">
          <h2 className="text-3xl font-bold tracking-tight text-center">Awards & Recognition</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award, index) => (
              <div
                key={index}
                className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm hover:shadow-md transition-shadow space-y-4"
              >
                <Badge variant="outline" className="mb-2">
                  {award.year}
                </Badge>
                <h3 className="text-xl font-semibold tracking-tight">{award.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {award.organization}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
