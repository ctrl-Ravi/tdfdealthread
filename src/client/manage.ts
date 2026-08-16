import { Endpoint } from '../shared/api.ts';

let globalData: any = null;

async function init() {
  const app = document.getElementById('app')!;
  try {
    const rsp = await fetch(`/${Endpoint.ManageGet}`);
    if (!rsp.ok) {
      const text = await rsp.text();
      console.error("API Error Response:", text);
      let errorMsg = "Unable to load megathread management.";
      try {
        const json = JSON.parse(text);
        if (json.error && json.error.includes("moderator-required")) {
          errorMsg = "Moderator access required.";
        }
      } catch (e) { }
      app.innerHTML = `<h3>Error</h3><p>${errorMsg}</p>`;
      return;
    }
    globalData = await rsp.json();
    renderUI(app, globalData);
  } catch (err) {
    console.error("Fetch Error:", err);
    app.innerHTML = `<h3>Error</h3><p>Unable to connect to management API.</p>`;
  }
}

function bindDefaultImageEvents(data: any) {
  const btnChange = document.getElementById('btn-change-default-image');
  
  if (btnChange) {
    btnChange.addEventListener('click', () => {
      const area = document.getElementById('default-image-action-area')!;
      area.innerHTML = `
        <h4>Set Default Image</h4>
        <input type="text" id="default-image-url-input" placeholder="https://..." style="width: 100%; padding: 5px;" value="${data.defaultImageUrl || ''}" />
        <div style="margin-top: 10px;">
          <button class="btn" id="btn-save-default-image">Save Default Image</button>
          <button class="btn" id="btn-cancel-default-image">Cancel</button>
        </div>
      `;
      document.getElementById('btn-save-default-image')!.addEventListener('click', async () => {
        const url = (document.getElementById('default-image-url-input') as HTMLInputElement).value.trim();
        if (!url) return;
        await performAction(`/${Endpoint.ManageSetDefaultImage}`, { imageUrl: url });
      });
      document.getElementById('btn-cancel-default-image')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  }


}

function bindTodayImageEvents(data: any) {
  const btnChange = document.getElementById('btn-change-today-image');
  const btnRemove = document.getElementById('btn-remove-today-image');
  
  if (btnChange) {
    btnChange.addEventListener('click', () => {
      const area = document.getElementById('today-image-action-area')!;
      area.innerHTML = `
        <h4>Set Today's Custom Image</h4>
        <input type="text" id="today-image-url-input" placeholder="https://..." style="width: 100%; padding: 5px;" value="${data.todayImageUrl || ''}" />
        <div style="margin-top: 10px;">
          <button class="btn" id="btn-save-today-image">Save Today's Image</button>
          <button class="btn" id="btn-cancel-today-image">Cancel</button>
        </div>
      `;
      document.getElementById('btn-save-today-image')!.addEventListener('click', async () => {
        const url = (document.getElementById('today-image-url-input') as HTMLInputElement).value.trim();
        if (!url) return;
        await performAction(`/${Endpoint.ManageImage}`, { imageUrl: url });
      });
      document.getElementById('btn-cancel-today-image')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  }

  if (btnRemove) {
    btnRemove.addEventListener('click', () => {
      const area = document.getElementById('today-image-action-area')!;
      area.innerHTML = `
        <h4>Remove Today's Image</h4>
        <p>Are you sure you want to remove today's custom image override?</p>
        <button class="btn" id="btn-confirm-remove-today-image" style="background-color: #f44336; color: white;">Remove</button>
        <button class="btn" id="btn-cancel-remove-today-image">Cancel</button>
      `;
      document.getElementById('btn-confirm-remove-today-image')!.addEventListener('click', async () => {
        await performAction(`/${Endpoint.ManageImage}`, { action: 'remove' });
      });
      document.getElementById('btn-cancel-remove-today-image')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  }
}

function renderUI(app: HTMLElement, data: any) {
  let html = `
    <header style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eaeaea;">
      <img src="tdf-logo.jpg" alt="TopDealsFinder Logo" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover;" />
      <div>
        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #111;">TDF Deal Thread</h3>
        <p style="margin: 2px 0 0 0; font-size: 0.85rem; color: #666;">Moderator Control Panel</p>
      </div>
    </header>
  `;

  html += `
    <div style="margin-bottom: 15px;">
      <label>Recreation Mode: </label>
      <select id="recreate-mode">
        <option value="none" ${data.recreateMode === 'none' ? 'selected' : ''}>Automatic (none)</option>
        <option value="next-deal" ${data.recreateMode === 'next-deal' ? 'selected' : ''}>On Next Deal</option>
        <option value="manual" ${data.recreateMode === 'manual' ? 'selected' : ''}>Manual Only</option>
      </select>
    </div>
    <hr style="margin: 20px 0;" />
    <h4>🖼️ Default Megathread Image (Permanent)</h4>
    <div id="default-image-area">
      ${data.defaultImageUrl 
        ? `<p>Current default image URL: <br><a href="${escapeHtml(data.defaultImageUrl)}" target="_blank" rel="noopener noreferrer" style="word-break: break-all;">${escapeHtml(data.defaultImageUrl)}</a></p>
           <img src="${escapeHtml(data.defaultImageUrl)}" style="max-width: 200px; max-height: 200px; display: block; margin-bottom: 10px;" />
           <button class="btn" id="btn-change-default-image">Change Default</button>`
        : `<p>No default image configured.</p>
           <button class="btn" id="btn-change-default-image">Set Default Image</button>`
      }
    </div>
    <div id="default-image-action-area" style="margin-top: 10px;"></div>
    <hr style="margin: 15px 0;" />
    <h4>📅 Today's Megathread Image</h4>
    <div id="today-image-area">
      ${data.todayImageUrl 
        ? `<p>Current today's image: <br><a href="${escapeHtml(data.todayImageUrl)}" target="_blank" rel="noopener noreferrer" style="word-break: break-all;">${escapeHtml(data.todayImageUrl)}</a></p>
           <img src="${escapeHtml(data.todayImageUrl)}" style="max-width: 200px; max-height: 200px; display: block; margin-bottom: 10px;" />
           <button class="btn" id="btn-change-today-image">Change Today's Image</button>
           <button class="btn" style="background-color: #f44336; color: white;" id="btn-remove-today-image">Remove Today's Image</button>`
        : `<p>No custom image set for today ${data.defaultImageUrl ? '(using default fallback)' : '(text-only)'}.</p>
           <button class="btn" id="btn-change-today-image">Set Today's Image</button>`
      }
    </div>
    <div id="today-image-action-area" style="margin-top: 10px;"></div>
    <hr style="margin: 20px 0;" />
  `;

  if (!data.exists) {
    html += `
      <p>No megathread exists for today.</p>
      <button class="btn" id="btn-create">➕ Create Today's Megathread</button>
      <div id="action-area" style="margin-top: 20px;"></div>
    `;
    app.innerHTML = html;

    document.getElementById('recreate-mode')!.addEventListener('change', async (e) => {
      const mode = (e.target as HTMLSelectElement).value;
      await performAction(`/${Endpoint.ManageRecreateMode}`, { mode });
    });

    bindDefaultImageEvents(data);
    bindTodayImageEvents(data);

    document.getElementById('btn-create')!.addEventListener('click', async () => {
      if (data.queueCount === 0) {
        const area = document.getElementById('action-area')!;
        area.innerHTML = `
          <h4>Empty Megathread</h4>
          <p>No qualifying deals found for today.</p>
          <button class="btn" id="btn-confirm-create">Create Empty Megathread</button>
          <button class="btn" id="btn-cancel-create">Cancel</button>
        `;
        document.getElementById('btn-confirm-create')!.addEventListener('click', async () => {
          await performAction(`/${Endpoint.ManageCreate}`);
        });
        document.getElementById('btn-cancel-create')!.addEventListener('click', () => {
          area.innerHTML = '';
        });
        return;
      }
      await performAction(`/${Endpoint.ManageCreate}`);
    });
    
    return;
  }

  html += `
    <p><strong>Today's Megathread</strong></p>
    <p>Status: ✅ Active</p>
    <p>Deals: ${data.dealCount}</p>
    <p>Last updated: ${data.lastUpdated}</p>
    
    <div>
      <button class="btn" id="btn-refresh">🔄 Synchronize Megathread</button>
      <button class="btn" id="btn-edit">📝 Edit Body</button>
      <button class="btn" id="btn-delete">🗑️ Delete Megathread</button>
    </div>
    <div id="action-area" style="margin-top: 20px;"></div>
    
    <hr style="margin: 20px 0;" />
    <h4>Deal Comments</h4>
    <div id="comments-list">
  `;

  if (data.comments && data.comments.length > 0) {
    data.comments.forEach((c: any) => {
      let statusIcon = c.status === 'published' ? '✅ Published' : 
                       (c.status === 'deleted' ? '❌ Deleted' : 
                       (c.status === 'deleted-source-unavailable' ? '🚫 Source Unavailable' : '⏳ Pending'));

      html += `
        <div style="border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
          <p style="margin: 0 0 5px 0;"><strong>🔥 ${escapeHtml(c.title || 'Untitled Deal')}</strong></p>
          <p style="margin: 0 0 10px 0; font-size: 0.9em; color: #555;">Status: ${statusIcon}</p>
          <div>
      `;

      if (c.status === 'published') {
        html += `
            <button class="btn btn-comment-edit" data-id="${c.dealId}">✏️ Edit</button>
            <button class="btn btn-comment-delete" data-id="${c.dealId}">🗑️ Delete</button>
        `;
      } else if (c.status === 'deleted') {
        html += `
            <button class="btn btn-comment-restore" data-id="${c.dealId}">♻️ Restore Comment</button>
        `;
      } else {
        html += `
            <button class="btn btn-comment-publish" data-id="${c.dealId}">Publish</button>
        `;
      }

      html += `</div></div>`;
    });
  } else {
    html += `<p>No deals in queue yet.</p>`;
  }

  html += `</div>`;
  app.innerHTML = html;

  const btnDelete = document.getElementById('btn-delete');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
      const area = document.getElementById('action-area')!;
      area.innerHTML = `
        <h4>Delete Megathread</h4>
        <p>Choose how to proceed with the deletion:</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button class="btn" id="btn-confirm-delete-only" style="background-color: #f44336; color: white;">Delete Only</button>
          <button class="btn" id="btn-confirm-delete-recreate">Delete & Create New Now</button>
          <button class="btn" id="btn-confirm-delete-next">Delete & Create On Next Deal</button>
          <button class="btn" id="btn-cancel-delete">Cancel</button>
        </div>
      `;
      document.getElementById('btn-confirm-delete-only')!.addEventListener('click', async () => {
        await performAction(`/${Endpoint.ManageDelete}`, { mode: 'delete-only' });
      });
      document.getElementById('btn-confirm-delete-recreate')!.addEventListener('click', async () => {
        await performAction(`/${Endpoint.ManageDelete}`, { mode: 'recreate-now' });
      });
      document.getElementById('btn-confirm-delete-next')!.addEventListener('click', async () => {
        await performAction(`/${Endpoint.ManageDelete}`, { mode: 'next-deal' });
      });
      document.getElementById('btn-cancel-delete')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  }

  document.getElementById('recreate-mode')!.addEventListener('change', async (e) => {
    const mode = (e.target as HTMLSelectElement).value;
    await performAction(`/${Endpoint.ManageRecreateMode}`, { mode });
  });

  bindDefaultImageEvents(data);
  bindTodayImageEvents(data);

  document.getElementById('btn-refresh')!.addEventListener('click', async () => {
    await performAction(`/${Endpoint.ManageRefresh}`);
  });

  document.getElementById('btn-edit')!.addEventListener('click', () => {
    const area = document.getElementById('action-area')!;
    area.innerHTML = `
      <h4>Edit Megathread Body</h4>
      <textarea id="edit-body" rows="10">${escapeHtml(data.body)}</textarea>
      <button class="btn" id="btn-save-edit">Save</button>
    `;
    document.getElementById('btn-save-edit')!.addEventListener('click', async () => {
      const body = (document.getElementById('edit-body') as HTMLTextAreaElement).value;
      await performAction(`/${Endpoint.ManageEdit}`, { title: data.title, body });
    });
  });

  document.getElementById('btn-delete')!.addEventListener('click', () => {
    const area = document.getElementById('action-area')!;
    area.innerHTML = `
      <h4>Delete Today's Megathread?</h4>
      <button class="btn" id="btn-del-cancel">Cancel</button>
      <button class="btn" id="btn-del-only">Delete Only</button>
      <button class="btn" id="btn-del-now">Delete & Create New Now</button>
      <button class="btn" id="btn-del-next">Delete & Create On Next Deal</button>
    `;

    document.getElementById('btn-del-cancel')!.addEventListener('click', () => {
      area.innerHTML = '';
    });
    document.getElementById('btn-del-only')!.addEventListener('click', async () => {
      await performAction(`/${Endpoint.ManageDelete}`, { mode: 'delete-only' });
    });
    document.getElementById('btn-del-now')!.addEventListener('click', async () => {
      await performAction(`/${Endpoint.ManageDelete}`, { mode: 'recreate-now' });
    });
    document.getElementById('btn-del-next')!.addEventListener('click', async () => {
      await performAction(`/${Endpoint.ManageDelete}`, { mode: 'next-deal' });
    });
  });

  // Comment Actions
  document.querySelectorAll('.btn-comment-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const dealId = (e.target as HTMLElement).getAttribute('data-id');
      const commentData = data.comments.find((c: any) => c.dealId === dealId);
      const area = document.getElementById('action-area')!;
      area.innerHTML = `
        <h4>Edit Comment</h4>
        <p style="color: #d9534f; font-size: 0.9em;"><strong>⚠️ Warning:</strong> Editing an image/RichText comment will permanently replace it with text-only content.</p>
        <textarea id="edit-comment-body" rows="10">${escapeHtml(commentData?.body || '')}</textarea>
        <button class="btn" id="btn-save-comment-edit">Save Changes</button>
        <button class="btn" id="btn-cancel-comment-edit">Cancel</button>
      `;

      document.getElementById('btn-save-comment-edit')!.addEventListener('click', async () => {
        const body = (document.getElementById('edit-comment-body') as HTMLTextAreaElement).value;
        await performAction(`/${Endpoint.ManageCommentEdit}`, { dealId, body });
      });
      document.getElementById('btn-cancel-comment-edit')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  });

  document.querySelectorAll('.btn-comment-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const dealId = (e.currentTarget as HTMLElement).getAttribute('data-id');
      const area = document.getElementById('action-area')!;
      area.innerHTML = `
        <h4>Confirm Deletion</h4>
        <p>Are you sure you want to delete this deal comment?</p>
        <button class="btn" id="btn-confirm-del-comment">Yes, Delete</button>
        <button class="btn" id="btn-cancel-del-comment">Cancel</button>
      `;
      document.getElementById('btn-confirm-del-comment')!.addEventListener('click', async () => {
        await performAction(`/${Endpoint.ManageCommentDelete}`, { dealId });
      });
      document.getElementById('btn-cancel-del-comment')!.addEventListener('click', () => {
        area.innerHTML = '';
      });
    });
  });

  document.querySelectorAll('.btn-comment-restore').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const dealId = (e.target as HTMLElement).getAttribute('data-id');
      await performAction(`/${Endpoint.ManageCommentRestore}`, { dealId });
    });
  });

  document.querySelectorAll('.btn-comment-publish').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const dealId = (e.target as HTMLElement).getAttribute('data-id');
      await performAction(`/${Endpoint.ManageCommentPublishPending}`, { dealId });
    });
  });
}

function escapeHtml(unsafe: string) {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function performAction(endpoint: string, bodyData?: any) {
  const app = document.getElementById('app')!;
  app.innerHTML = '<p>Processing...</p>';
  try {
    const rsp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyData ? JSON.stringify(bodyData) : undefined
    });
    if (!rsp.ok) {
      const txt = await rsp.text();
      app.innerHTML = `<h3>Error</h3><p style="color: red;">${escapeHtml(txt)}</p><button class="btn" id="btn-back" style="margin-top: 15px;">Go Back</button>`;
      document.getElementById('btn-back')!.addEventListener('click', init);
      return;
    }
  } catch (err: any) {
    app.innerHTML = `<h3>Error</h3><p style="color: red;">${escapeHtml(err.message || String(err))}</p><button class="btn" id="btn-back" style="margin-top: 15px;">Go Back</button>`;
    document.getElementById('btn-back')!.addEventListener('click', init);
    return;
  }
  // reload state
  init();
}

init();
