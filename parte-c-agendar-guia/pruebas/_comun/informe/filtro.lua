-- Mermaid como <pre class="mermaid">; título; número de sección resaltado; llamada y metadatos
function CodeBlock(el)
  if el.classes[1] == "mermaid" then
    local t = el.text:gsub("&","&amp;"):gsub("<","&lt;"):gsub(">","&gt;")
    return pandoc.RawBlock("html", '<pre class="mermaid">' .. t .. '</pre>')
  end
end
function Header(el)
  if el.level == 2 and el.content[1] and el.content[1].t == "Str" and el.content[1].text:match("^%d+%.$") then
    local n = el.content[1].text
    el.content[1] = pandoc.Span({pandoc.Str(n)}, pandoc.Attr("", {"num"}))
    return el
  end
end
function Para(el)
  if #el.content == 1 and el.content[1].t == "Strong" then return pandoc.Div({el}, pandoc.Attr("", {"keep"})) end
  local first = el.content[1]
  if first and first.t == "Strong" then
    local s = pandoc.utils.stringify(first)
    if s:match("^Propuesta en una frase") or s:match("^Resumen") then return pandoc.Div({el}, pandoc.Attr("", {"callout"})) end
    if s:match("^Autor") then return pandoc.Div({el}, pandoc.Attr("", {"meta"})) end
  end
end
