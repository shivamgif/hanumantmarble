import Head from "next/head";
import React, { useState } from "react";
import "../styles/Home.module.css";
import { Carousel, Container } from "react-bootstrap";
import Link from "next/link";

export default function Home() {
  const [index, setIndex] = useState(0);

  const handleSelect = (selectedIndex, e) => {
    setIndex(selectedIndex);
  };

  return (
    <div>
      <main className="home">
        <div className="position-relative overflow-hidden text-center">
          {/* <Carousel
            activeIndex={index}
            onSelect={handleSelect}
            className="customhero"
            controls={false}
          >
            <Carousel.Item>
              <img src="/hero1.png" className="d-block carimg"></img>
            </Carousel.Item>
            <Carousel.Item>
              <img src="/hero2.jpeg" className="d-block carimg"></img>
            </Carousel.Item>
            <Carousel.Item>
              <img src="/hero3.jpeg" className="d-block carimg"></img>
            </Carousel.Item>
          </Carousel> */}
          <div className="text-light col-md-5 p-lg-5 mx-auto my-5 ">
            <h1 className="herotext fw-medium">FOR YOUR SWEET HOME</h1>
            <p className="subtitle">
              One of the biggest collection of tiles and sanitaryware in
              Lucknow. Build your dream home with us.
            </p>
            <a className="custombtn" href="/quote">
              Get Your Quotation
            </a>
          </div>
        </div>
        <div className="row">
          <Link href="/kajaria">
            <div className="productbox">
              <div className="">
                <img src="/product3.png"></img>
                <p className="lead">
                  Crafted with passion, the digital vitrified tiles feature
                  extraordinary aesthetic appeal and supreme quality.
                </p>
              </div>
              <div className="bg-light shadow-sm mx-auto custom-box"></div>
            </div>
          </Link>
          <Link href="/kajaria">
            <div id="products" className="productbox">
              <div className="">
                <img src="/product0.png"></img>
                <p className="lead">
                  Exceptionally designed products for your home. Easy to clean
                  rimless design for utmost hygiene
                </p>
              </div>
              <div className="bg-light shadow-sm mx-auto custom-box"></div>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
