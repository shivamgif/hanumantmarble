import { NextResponse } from 'next/server';
import { auth0 } from '@/lib/auth0';
import { isAdmin } from '@/lib/admin-config';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'shivamgif';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'hanumantmarble';
const FILE_PATH = 'data/products.json';
const BRANCH = 'main';

// GET - Fetch products from GitHub
export async function GET() {
  try {
    // If GitHub token is not configured, read from local file
    if (!GITHUB_TOKEN) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'data', 'products.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const products = JSON.parse(fileContent);
      
      return NextResponse.json({ 
        products, 
        sha: 'local-dev-mode',
        warning: 'Running in local mode. Set GITHUB_TOKEN to enable GitHub sync.'
      });
    }

    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      console.error('GitHub API error:', await response.text());
      throw new Error('Failed to fetch products from GitHub');
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const products = JSON.parse(content);

    return NextResponse.json({ products, sha: data.sha });
  } catch (error) {
    console.error('Error fetching products:', error);
    
    // Fallback to local file if GitHub fails
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'data', 'products.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const products = JSON.parse(fileContent);
      
      return NextResponse.json({ 
        products, 
        sha: 'fallback-mode',
        warning: 'GitHub sync failed. Using local file. Error: ' + error.message
      });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: 'Failed to fetch products: ' + error.message },
        { status: 500 }
      );
    }
  }
}

// PUT - Update products on GitHub
export async function PUT(request) {
  try {
    // Check authentication using Auth0Client
    const session = await auth0.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!isAdmin(session.user.email)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { products, sha } = await request.json();

    if (!products || !sha) {
      return NextResponse.json(
        { error: 'Products and SHA are required' },
        { status: 400 }
      );
    }

    // If no GitHub token, save locally
    if (!GITHUB_TOKEN) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'data', 'products.json');
      fs.writeFileSync(filePath, JSON.stringify(products, null, 2), 'utf-8');
      
      return NextResponse.json({
        success: true,
        sha: 'local-dev-mode',
        message: 'Products saved locally. Set GITHUB_TOKEN to enable GitHub sync.',
      });
    }

    // Update file on GitHub
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update products via admin panel - ${new Date().toISOString()}`,
          content: Buffer.from(JSON.stringify(products, null, 2)).toString('base64'),
          sha: sha,
          branch: BRANCH,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GitHub API error:', errorText);
      throw new Error('Failed to update products on GitHub');
    }

    const result = await response.json();

    // Trigger Netlify rebuild if webhook is configured
    if (process.env.NETLIFY_BUILD_HOOK) {
      try {
        await fetch(process.env.NETLIFY_BUILD_HOOK, { method: 'POST' });
      } catch (webhookError) {
        console.error('Failed to trigger Netlify rebuild:', webhookError);
      }
    }

    return NextResponse.json({
      success: true,
      sha: result.content.sha,
      message: 'Products updated successfully',
    });
  } catch (error) {
    console.error('Error updating products:', error);
    return NextResponse.json(
      { error: 'Failed to update products' },
      { status: 500 }
    );
  }
}
