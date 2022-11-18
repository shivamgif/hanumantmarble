import Head from 'next/head';
import React, { useState } from 'react';
import '../styles/Home.module.css';
import { Carousel, Nav,NavDropdown,Container, Navbar} from 'react-bootstrap';
import Link from 'next/link';

export default function Home() {
  const [index, setIndex] = useState(0);

  const handleSelect = (selectedIndex, e) => {
    setIndex(selectedIndex);
  };

  return (
  <div>
  <Navbar className='site-header sticky-top' expand="sm" variant='dark'>
  <Container>
  <Navbar.Brand href="/"><h3>Hanumant Marble</h3></Navbar.Brand>
  <Navbar.Toggle aria-controls="basic-navbar-nav" />
  <Navbar.Collapse id="basic-navbar-nav">
  <Nav className="me-auto">
        <Nav.Item className='px-4'><Link href="/#products">Products</Link></Nav.Item>
        <Nav.Item  className='px-4'><Link href="#">Locations</Link></Nav.Item>
        <Nav.Item className='px-4'><Link href="#">Get Your Quotation</Link></Nav.Item>
        <Nav.Item className='px-4'><Link href="#">About Us</Link></Nav.Item>
  </Nav>
  </Navbar.Collapse>
  </Container>
</Navbar>
<main>
  <div class="position-relative overflow-hidden p-3 p-md-5 m-md-3 text-center">
  <Carousel activeIndex={index} onSelect={handleSelect} class="customhero" controls={false} >
    <Carousel.Item >
      <img src="/hero1.png" class="d-block carimg"></img>
    </Carousel.Item>
    <Carousel.Item >
      <img src="/hero2.jpeg" class="d-block carimg"></img>
    </Carousel.Item>
    <Carousel.Item >
      <img src="/hero3.jpeg" class="d-block carimg"></img>
    </Carousel.Item>
  </Carousel>
    <div class="text-light col-md-5 p-lg-5 mx-auto my-5 ">
      <h1 class="display-4 fw-normal">FOR YOUR SWEET HOME</h1>
      <p class="lead fw-normal">And an even wittier subheading to boot. Jumpstart your marketing efforts with this example based on Apple’s marketing pages.</p>
      <a class="btn btn-outline-warning" href="#">Get Your Quotation</a>
    </div>
  </div>

  <div class="d-md-flex flex-md-equal w-100 my-md-3 ps-md-3">
    <div id="products" class="text-bg-dark me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
      <div class="my-3 py-3">
        <img src='/product0.png'></img>
        <p class="lead">Exceptionally designed products for your home. Easy to clean rimless design for utmost hygiene</p>
      </div>
      <div class="bg-dark shadow-sm mx-auto custom-box" ></div>
    </div>
    <div class="text-bg-dark me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
      <div class="my-3 p-3">
        <img src='/product1.png'></img>
        <p class="lead">Style and durability - together. Variety of finishings!</p>
      </div>
      <div class="bg-dark shadow-sm mx-auto custom-box" ></div>
    </div>
  </div>

  <div class="d-md-flex flex-md-equal w-100 my-md-3 ps-md-3">
    <div class="text-bg-light  me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
      <div class="my-3 p-3">
        <img src='/product2.png'></img>
        <p class="lead">And an even wittier subheading.</p>
      </div>
      <div class="bg-light shadow-sm mx-auto custom-box"></div>
    </div>
    <div class="text-bg-light me-md-3 pt-3 px-3 pt-md-5 px-md-5 text-center overflow-hidden">
      <div class="my-3 py-3">
      <img src='/product3.png'></img>
        <p class="lead">And an even wittier subheading.</p>
      </div>
      <div class="bg-light shadow-sm mx-auto custom-box"></div>
    </div>
  </div>


</main>

<footer class="container py-5">
  <div class="row">
    <div class="col-12 col-md">
      <h4>Hanumant Marble</h4>
      <small class="d-block mb-3 text-muted">&copy; 2017–2022</small>
    </div>
    <div class="col-6 col-md">
      <h5>Features</h5>
      <ul class="list-unstyled text-small">
      </ul>
    </div>
    <div class="col-6 col-md">
      <h5>Resources</h5>
      <ul class="list-unstyled text-small">
      </ul>
    </div>
    <div class="col-6 col-md">
      <h5>Resources</h5>
      <ul class="list-unstyled text-small">
      </ul>
    </div>
    <div class="col-6 col-md">
      <h5>About</h5>
      <ul class="list-unstyled text-small">
      </ul>
    </div>
  </div>
</footer>
</div>
)}
