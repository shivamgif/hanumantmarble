import Head from 'next/head';
import React, { useState } from 'react';
import '../styles/home.module.css';
import {Carousel} from 'react-bootstrap';
import Link from 'next/link';

export default function Home() {
  const [index, setIndex] = useState(0);

  const handleSelect = (selectedIndex, e) => {
    setIndex(selectedIndex);
  };

  return (
  <div>
  <main>
    <div className="position-relative overflow-hidden p-3 p-md-5 m-md-3 text-center">
    <Carousel activeIndex={index} onSelect={handleSelect} className="customhero" controls={false} >
      <Carousel.Item >
        <img src="/hero1.png" className="d-block carimg"></img>
      </Carousel.Item>
      <Carousel.Item >
        <img src="/hero2.jpeg" className="d-block carimg"></img>
      </Carousel.Item>
      <Carousel.Item >
        <img src="/hero3.jpeg" className="d-block carimg"></img>
      </Carousel.Item>
    </Carousel>
      <div className="text-light col-md-5 p-lg-5 mx-auto my-5 ">
        <h1 className="display-4 fw-normal">FOR YOUR SWEET HOME</h1>
        <p className="lead fw-normal">And an even wittier subheading to boot. Jumpstart your marketing efforts with this example based on Apple’s marketing pages.</p>
        <a className="btn btn-outline-warning" href="/quote">Get Your Quotation</a>
      </div>
    </div>

    <div className="d-md-flex flex-md-equal w-100 my-md-3 ps-md-3">
    <Link href="/kajaria">
      <div className="text-bg-light  me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
        <div className="my-3 p-3">
          <img src='/product2.png'></img>
          <p className="lead">Crafted with passion, the digital vitrified tiles feature extraordinary aesthetic appeal and supreme quality. The unique Nano Polish, along with special glazes, ensures they remain stain-proof, scratch-proof and abrasion-resistant.</p>
        </div>
        <div className="bg-light shadow-sm mx-auto custom-box"></div>
      </div>
      
      </Link>
      <div className="text-bg-light  me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
        
        <div className="my-3 py-3">
        <img src='/product3.png'></img>
          <p className="lead">And an even wittier subheading.</p>
        </div>
        <div className="bg-light shadow-sm mx-auto custom-box"></div>
        
      </div>
    </div>

    <div className="d-md-flex flex-md-equal w-100 my-md-3 ps-md-3">
      <div id="products" className="text-bg-light  me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
        <div className="my-3 py-3">
          <img src='/product0.png'></img>
          <p className="lead">Exceptionally designed products for your home. Easy to clean rimless design for utmost hygiene</p>
        </div>
        <div className="bg-light shadow-sm mx-auto custom-box" ></div>
      </div>
      <div className="text-bg-light  me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
        <div className="my-3 p-3">
          <img src='/product1.png'></img>
          <p className="lead">Style and durability - together. Variety of finishings!</p>
        </div>
        <div className="bg-light shadow-sm mx-auto custom-box" ></div>
      </div>
    </div>

    


</main>
</div>
)}
