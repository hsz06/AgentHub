# Three-Minute Demo Route

1. Register or log in and open **Control Center > Providers**. Configure MiMo with the OpenAI-compatible URL and model, then run **Test**.
2. Create a single chat with MiMo and ask for an HTML landing page. Show streamed output and its isolated preview card.
3. Create a group chat with two or more Agents, send a structured `@Agent` request, and open **Task status** to show the persisted execution graph.
4. Import a project ZIP or use Electron **Import local directory**, then ask an Agent to propose a file change in that workspace.
5. Open **Approvals**, review the Diff, approve it, and show the new workspace file plus Code artifact version.
6. Open a Markdown artifact and a Slides artifact. Edit content, restore an earlier version, preview Slides, and export `.pptx`.
7. On a narrow/mobile PWA window, approve a static publication or Docker deployment request and follow deployment state/logs.
8. Open the published preview URL. In Electron, export an artifact locally and observe the deployment notification.

For full-stack deployment, the imported workspace must include a root `Dockerfile`, and Docker must be available to the worker host.
