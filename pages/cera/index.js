import {Container} from 'react-bootstrap';
import React, { useState } from 'react';
import { Document, Page, pdfjs } from "react-pdf";
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.js`;

export default function Cera(){
        
            return (
              <>
              <Container className='pdfdocument'>
                <div>Cera</div>
                </Container>
              </>
);}
