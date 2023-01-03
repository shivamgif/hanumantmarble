import { Component } from "react";

const Footer = () => {
  return (
    <footer className="footer  py-5">
      <div className="row">
        <div className="col-12 col-md">
          <h4>Hanumant Marble</h4>
          <small className="d-block mb-3 text-muted">&copy; 2017–2022</small>
        </div>
        <div className="col-6 col-md">
          <h5>Instagram</h5>
          <ul className="list-unstyled text-small"></ul>
        </div>
        <div className="col-6 col-md">
          <h5>E-mail</h5>
          <ul className="list-unstyled text-small"></ul>
        </div>
        <div className="col-6 col-md">
          <h5>Locations</h5>
          <ul className="list-unstyled text-small"></ul>
        </div>
        <div className="col-6 col-md">
          <h5>About</h5>
          <ul className="list-unstyled text-small"></ul>
        </div>
      </div>
    </footer>
  );
};
export default Footer;
