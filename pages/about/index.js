import Head from "next/head";
import Image from "next/image";

export default function About() {
  const galleryImages = [
    "/images/gallery1.jpg",
    "/images/gallery2.jpg",
    "/images/gallery3.jpg",
    "/images/gallery4.jpg",
    "/images/gallery5.jpg",
    "/images/gallery6.jpg",
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
        <section>
          <h1 className="text-4xl font-bold text-center mb-8">About Us</h1>
          <p className="text-xl text-gray-600 text-center max-w-3xl mx-auto mb-12">
            With over 25 years of experience in the natural stone industry, Hanumant
            Marble has established itself as a leading supplier of premium marble and
            granite products.
          </p>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="text-gray-600">
              <p className="leading-relaxed">
                Our commitment to quality and customer satisfaction has made us the
                preferred choice for architects, interior designers, and homeowners.
                We source our materials from the finest quarries worldwide to ensure
                superior quality and unique patterns.
              </p>
            </div>
            <div className="text-gray-600">
              <p className="leading-relaxed">
                Our state-of-the-art facility and experienced team ensure precise
                cutting, polishing, and finishing of every stone piece. We take pride
                in our vast inventory and ability to cater to projects of any scale.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-bold text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryImages.map((image, index) => (
              <div key={index} className="relative h-64 rounded-lg overflow-hidden hover:opacity-90 transition-opacity">
                <Image
                  src={image}
                  alt={`Gallery image ${index + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-3xl font-bold text-center mb-12">Awards & Recognition</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow"
              >
                <div className="text-center">
                  <h3 className="text-xl font-semibold mb-2">{award.title}</h3>
                  <p className="text-gray-500 mb-4">{award.year}</p>
                  <p className="text-gray-600">{award.organization}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
