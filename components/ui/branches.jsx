"use client"

import { Building2, MapPin, Phone, BarChart } from "lucide-react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/hooks/useInView"

const branchData = [
  {
    name: "Delhi Branch",
    address: "123 Marble Market, Karol Bagh, New Delhi - 110005",
    contact: "+91 98765 43210",
    stats: "5000+ Satisfied Customers"
  },
  {
    name: "Mumbai Branch",
    address: "45 Ceramic Center, Andheri West, Mumbai - 400053",
    contact: "+91 98765 43211",
    stats: "1000+ Projects Completed"
  },
  {
    name: "Bangalore Branch",
    address: "78 Stone Plaza, Whitefield, Bangalore - 560066",
    contact: "+91 98765 43212",
    stats: "3000+ Product Varieties"
  },
  {
    name: "Hyderabad Branch",
    address: "90 Tile Market, Gachibowli, Hyderabad - 500032",
    contact: "+91 98765 43213",
    stats: "15+ Years of Excellence"
  }
]

export function Branches() {
  const [titleRef, isTitleInView] = useInView({ threshold: 0.2 });
  const [branchesRef, isBranchesInView] = useInView({ threshold: 0.1 });

  return (
    <section id="branches" className="py-16 bg-muted/50">
      <div className="container mx-auto px-4">
        <div ref={titleRef}>
          <h2 className={cn(
            "text-3xl font-bold text-center mb-12 animate-on-scroll",
            isTitleInView ? 'in-view' : ''
          )}>
            Our Branches
            <div className={cn(
              "h-1 w-16 bg-primary mx-auto mt-4 rounded-full scale-on-scroll",
              isTitleInView ? 'in-view' : ''
            )}></div>
          </h2>
        </div>

        <div ref={branchesRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {branchData.map((branch, index) => (
            <div
              key={index}
              className={cn(
                "bg-card text-card-foreground rounded-lg shadow-lg p-6 hover-lift fade-on-scroll",
                isBranchesInView ? 'in-view' : ''
              )}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <div className="flex flex-col gap-4">
                <div className={cn(
                  "flex items-center gap-2 text-primary animate-on-scroll",
                  isBranchesInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 100 + 100}ms` }}>
                  <Building2 className="h-5 w-5 float-on-scroll" />
                  <h3 className="font-semibold">{branch.name}</h3>
                </div>
                
                <div className={cn(
                  "flex items-start gap-2 text-sm animate-on-scroll",
                  isBranchesInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 100 + 200}ms` }}>
                  <MapPin className="h-4 w-4 mt-1 text-muted-foreground float-on-scroll" />
                  <p className="text-muted-foreground">{branch.address}</p>
                </div>
                
                <div className={cn(
                  "flex items-center gap-2 text-sm animate-on-scroll",
                  isBranchesInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 100 + 300}ms` }}>
                  <Phone className="h-4 w-4 text-muted-foreground float-on-scroll" />
                  <p className="text-muted-foreground">{branch.contact}</p>
                </div>
                
                <div className={cn(
                  "flex items-center gap-2 mt-2 text-sm font-medium border-t pt-4 animate-on-scroll",
                  isBranchesInView ? 'in-view' : ''
                )} style={{ transitionDelay: `${index * 100 + 400}ms` }}>
                  <BarChart className="h-4 w-4 text-primary float-on-scroll" />
                  <p className="text-foreground">{branch.stats}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Branches
