
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

const defaultFields = [
    { "page": 1, "x": 10, "y": 10, "width": 200, "height": 50 },
    { "page": 2, "x": 10, "y": 10, "width": 200, "height": 50 },
    { "page": 3, "x": 10, "y": 10, "width": 200, "height": 50 },
    { "page": 4, "x": 10, "y": 10, "width": 200, "height": 50 },
    { "page": 5, "x": 10, "y": 10, "width": 200, "height": 50 },
];

export default function App() {
    const [pdfFile, setPdfFile] = useState(null);
    const [jsonInput, setJsonInput] = useState(JSON.stringify(defaultFields, null, 2));

    const [activePdf, setActivePdf] = useState(null);
    const [activeFields, setActiveFields] = useState([]);
    const [numPages, setNumPages] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Track runtime dimensions of each loaded page { [pageNum]: { width, height } }
    const [pageDimensions, setPageDimensions] = useState({});

    function handleFileChange(event) {
        const file = event.target.files?.[0];
        if (file) {
            setPdfFile(file);
            setPageDimensions({}); // Reset layout cache for new documents
        }
    }

    function handleRender() {
        setErrorMsg('');
        if (!pdfFile) {
            setErrorMsg('Please select a valid PDF file first.');
            return;
        }

        try {
            const parsedJson = JSON.parse(jsonInput);
            if (!Array.isArray(parsedJson)) {
                throw new Error('Coordinates configurations must be structured as a JSON Array [ ... ].');
            }
            setActivePdf(pdfFile);
            setActiveFields(parsedJson);
        } catch (err) {
            setErrorMsg(`Invalid JSON data: ${err.message}`);
        }
    }

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
    }

    // Capture the original PDF internal dimensions (points) when the page component initializes
    function onPageLoadSuccess(page) {
        const { pageNumber, originalWidth, originalHeight } = page;
        setPageDimensions(prev => ({
            ...prev,
            [pageNumber]: { width: originalWidth, height: originalHeight }
        }));
    }

    return (
        <div style={styles.appLayout}>
            <div style={styles.sidebar}>
                <h2 style={styles.sidebarTitle}>Draw Rectangle On PDF</h2>

                <div style={styles.inputGroup}>
                    <label style={styles.label}>1. Select PDF Document</label>
                    <input type="file" accept="application/pdf" onChange={handleFileChange} style={styles.fileInput} />
                    {pdfFile && <p style={styles.fileStatus}>📄 Selected: {pdfFile.name}</p>}
                </div>

                <div style={styles.inputGroup}>
                    <label style={styles.label}>2. Target Box Overlays (JSON)</label>
                    <textarea
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                        style={styles.textarea}
                        rows={14}
                    />
                </div>

                <button onClick={handleRender} style={styles.renderButton}>⚡ Render Document</button>
                {errorMsg && <div style={styles.errorBanner}>⚠️ {errorMsg}</div>}
            </div>

            <div style={styles.viewerPane}>
                {activePdf ? (
                    <Document file={activePdf} onLoadSuccess={onDocumentLoadSuccess}>
                        {Array.from(new Array(numPages), (el, index) => {
                            const pageNumber = index + 1;
                            const pageFields = activeFields.filter(f => f.page === pageNumber);
                            const origDim = pageDimensions[pageNumber];
                            console.log("original Dim", origDim)
                            return (
                                <div
                                    key={pageNumber}
                                    style={{
                                        ...styles.pageWrapper,
                                        // Enforce exact explicit native dimensions on the wrapper container if known
                                        width: origDim ? `${origDim.width}px` : 'auto',
                                        height: origDim ? `${origDim.height}px` : 'auto'
                                    }}
                                >
                                    <Page
                                        scale={1.0}
                                        pageNumber={pageNumber}
                                        width={origDim ? origDim.width : undefined}
                                        height={origDim ? origDim.height : undefined}
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                        onLoadSuccess={onPageLoadSuccess}
                                    />

                                    {/* Only calculate and display overlays once native page parameters are registered */}
                                    {origDim && (
                                        <div style={styles.overlayContainer}>
                                            {pageFields.map((field, idx) => {
                                                // Convert coordinates to percentages relative to native dimensions
                                                const pctLeft = (field.x / origDim.width) * 100;
                                                const pctTop = (field.y / origDim.height) * 100;
                                                const pctWidth = (field.width / origDim.width) * 100;
                                                const pctHeight = (field.height / origDim.height) * 100;

                                                return (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            position: 'absolute',
                                                            left: `${pctLeft}%`,
                                                            top: `${pctTop}%`,
                                                            width: `${pctWidth}%`,
                                                            height: `${pctHeight}%`,
                                                            border: '2px solid #2563eb',
                                                            backgroundColor: 'rgba(37, 99, 235, 0.15)',
                                                            pointerEvents: 'none',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </Document>
                ) : (
                    <div style={styles.placeholderContainer}>
                        <div style={styles.placeholderIcon}>📂</div>
                        <h3>No Active Document Rendered</h3>
                        <p style={styles.placeholderSub}>Upload a PDF file and provide highlight coordinates configurations to start testing visual renders.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    appLayout: { display: 'flex', width: '100vw', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#f8fafc', overflow: 'hidden' },
    sidebar: { width: '360px', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' },
    sidebarTitle: { margin: '0 0 24px 0', fontSize: '20px', fontWeight: '700', color: '#0f172a' },
    inputGroup: { marginBottom: '20px' },
    label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '8px' },
    fileInput: { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' },
    fileStatus: { fontSize: '12px', color: '#16a34a', margin: '6px 0 0 0', fontWeight: '500' },
    textarea: { width: '100%', padding: '12px', fontFamily: 'monospace', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', boxSizing: 'border-box' },
    renderButton: { backgroundColor: '#2563eb', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' },
    errorBanner: { marginTop: '16px', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', padding: '12px', borderRadius: '6px', fontSize: '13px' },
    viewerPane: { flex: 1, overflowY: 'auto', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    pageWrapper: { position: 'relative', marginBottom: '32px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', borderRadius: '4px' },
    overlayContainer: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 },
    placeholderContainer: { marginTop: '20vh', textAlign: 'center', maxWidth: '400px', color: '#64748b' },
    placeholderIcon: { fontSize: '48px', marginBottom: '16px' },
    placeholderSub: { fontSize: '14px', color: '#94a3b8', marginTop: '8px' }
};
