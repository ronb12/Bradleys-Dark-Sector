from pathlib import Path
p = Path("/Users/ronellbradley/Projects/bradleys-dark-sector/src/components/BradleysDarkSectorThreeJS.tsx")
s = p.read_text()
begin = s.index("  function makeWeaponView() {")
end = s.index("  function switchWeapon(",begin)
assert "  function makePistolView()" in s[begin:end] and "new FBXLoader()" in s[begin:end]
block = '''  // Original, internally authored Dark Sector collection (no external gun downloads).
  function makeWeaponView(id: WeaponId = "m4"): THREE.Group {
    return createOriginalWeaponView(id);
  }

  function makePistolView(): THREE.Group {
    return createOriginalWeaponView("pistol");
  }

'''
p.write_text(s[:begin]+block+s[end:])
print("REPLACED",end-begin,"bytes of legacy FBX/GLB player weapon loading")
