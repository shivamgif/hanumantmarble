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
    <React.Fragment>
      <main className="home">
        <div className="container">
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
            <div className="d-flex flex-column align-items-center text-light col-md-8 p-lg-5 mx-auto my-5 ">
              <h1 className="herotext fw-medium mb-4">FOR YOUR SWEET HOME</h1>
              <p className="subtitle mb-4">
                One of the biggest collection of tiles and sanitaryware in
                Lucknow. Build your dream home with us.
              </p>
              <Link href="/quote">
                <a className="custombtn my-4">Get Your Quotation</a>
              </Link>
            </div>
          </div>
          <div className="row">
            <Link href="/kajaria">
              <div className="productbox">
                <img src="/product3.png"></img>
                <p className="lead">
                  Crafted with passion, the digital vitrified tiles feature
                  extraordinary aesthetic appeal and supreme quality.
                </p>
                <div className="bg-light shadow-sm mx-auto custom-box"></div>
              </div>
            </Link>
            <Link href="/kajaria">
              <div id="products" className="productbox">
                <img src="/product0.png"></img>
                <p className="lead">
                  Exceptionally designed products for your home. Easy to clean
                  rimless design for utmost hygiene
                </p>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </React.Fragment>
  );
}
