"use client"

import { useInView } from "react-intersection-observer";
import { cn } from "@/lib/utils";

export function useAnimateOnScroll(options) {
  const { ref, inView } = useInView(options);

  const getAnimationClasses = (baseClasses, animationClasses, delay) => {
    return {
      ref,
      className: cn(baseClasses, "animate-on-scroll", inView && animationClasses),
      style: { transitionDelay: inView ? delay : "0ms" },
    };
  };

  return { ref, inView, getAnimationClasses };
}
